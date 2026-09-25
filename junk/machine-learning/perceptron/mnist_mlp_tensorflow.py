"""Распознавание цифр MNIST многослойным персептроном на TensorFlow."""

import gzip
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

try:
    import tensorflow as tf
except ModuleNotFoundError as error:
    if error.name != "tensorflow":
        raise
    project_python = Path(__file__).resolve().parent / ".venv" / "Scripts" / "python.exe"
    if project_python.is_file() and Path(sys.executable).resolve() != project_python.resolve():
        # Если TensorFlow установлен в окружении проекта, продолжаем в нём.
        completed = subprocess.run(
            [str(project_python), str(Path(__file__).resolve()), *sys.argv[1:]],
            check=False,
        )
        raise SystemExit(completed.returncode)
    raise SystemExit(
        "TensorFlow не установлен для этого Python. Используйте совместимый "
        "64-битный Python 3.10–3.13 и выполните "
        "'python -m pip install tensorflow'."
    ) from error


DATA_URL = "https://storage.googleapis.com/cvdf-datasets/mnist/"
DATA_DIR = Path(__file__).resolve().parent / "mnist_data"
SEED = 42
HIDDEN_UNITS = 128
EPOCHS = 5
BATCH_SIZE = 128
LEARNING_RATE = 0.1


def get_archive(filename):
    """Скачивает исходный gzip-архив IDX один раз и сохраняет его в кэше."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / filename
    if path.is_file():
        return path

    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=DATA_DIR, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            with urllib.request.urlopen(DATA_URL + filename, timeout=45) as response:
                shutil.copyfileobj(response, temporary)
        os.replace(temporary_path, path)
    except (OSError, urllib.error.URLError) as error:
        raise RuntimeError(
            f"Не удалось получить MNIST ({filename}) из {DATA_URL}: {error}. "
            "Проверьте доступ к сети и повторите запуск."
        ) from error
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return path


def read_images(path, expected_count):
    """Разбирает заголовок IDX стандартной библиотекой, пиксели — TensorFlow."""
    try:
        with gzip.open(path, "rb") as archive:
            data = archive.read()
        if len(data) < 16:
            raise ValueError("заголовок изображений неполный")
        magic, count, rows, columns = struct.unpack(">IIII", data[:16])
        if magic != 2051 or count != expected_count or (rows, columns) != (28, 28):
            raise ValueError("неожиданный формат или размер набора изображений")
        if len(data) != 16 + count * rows * columns:
            raise ValueError("длина файла изображений не соответствует заголовку")
        return tf.reshape(tf.io.decode_raw(data[16:], tf.uint8), (count, rows, columns))
    except (OSError, EOFError, ValueError) as error:
        raise RuntimeError(
            f"Не удалось прочитать {path}: {error}. Удалите повреждённый файл "
            "и повторите запуск."
        ) from error


def read_labels(path, expected_count):
    """Разбирает IDX-метки, сохраняя их целыми индексами классов."""
    try:
        with gzip.open(path, "rb") as archive:
            data = archive.read()
        if len(data) < 8:
            raise ValueError("заголовок меток неполный")
        magic, count = struct.unpack(">II", data[:8])
        if magic != 2049 or count != expected_count:
            raise ValueError("неожиданный формат или число меток")
        if len(data) != 8 + count:
            raise ValueError("длина файла меток не соответствует заголовку")
        labels = tf.cast(tf.io.decode_raw(data[8:], tf.uint8), tf.int32)
        if bool(tf.reduce_any(labels > 9)):
            raise ValueError("обнаружена метка вне диапазона 0–9")
        return labels
    except (OSError, EOFError, ValueError) as error:
        raise RuntimeError(
            f"Не удалось прочитать {path}: {error}. Удалите повреждённый файл "
            "и повторите запуск."
        ) from error


def describe_split(name, images, labels):
    print(
        f"{name}: {images.shape[0]} примеров; "
        f"изображения {tuple(images.shape)}, метки {tuple(labels.shape)}; "
        f"метки [{int(tf.reduce_min(labels))}, {int(tf.reduce_max(labels))}], "
        f"пиксели [{int(tf.reduce_min(images))}, {int(tf.reduce_max(images))}]"
    )


def prepare_images(images):
    # Нормализация переводит uint8-пиксели 0–255 в float32-значения 0–1.
    normalized = tf.cast(images, tf.float32) / 255.0
    return tf.reshape(normalized, (-1, 28 * 28))


def create_parameters():
    # 128 ReLU-нейронов дают модели нелинейность при умеренном числе параметров.
    weights_hidden = tf.Variable(
        tf.random.normal((784, HIDDEN_UNITS), stddev=(2.0 / 784) ** 0.5),
        name="weights_hidden",
    )
    bias_hidden = tf.Variable(tf.zeros((HIDDEN_UNITS,)), name="bias_hidden")
    weights_output = tf.Variable(
        tf.random.normal((HIDDEN_UNITS, 10), stddev=(1.0 / HIDDEN_UNITS) ** 0.5),
        name="weights_output",
    )
    bias_output = tf.Variable(tf.zeros((10,)), name="bias_output")
    return [weights_hidden, bias_hidden, weights_output, bias_output]


def forward(features, parameters):
    weights_hidden, bias_hidden, weights_output, bias_output = parameters
    # Прямой проход: X @ W + b, ReLU и ещё одно X @ W + b для 10 логитов.
    hidden = tf.nn.relu(tf.matmul(features, weights_hidden) + bias_hidden)
    return tf.matmul(hidden, weights_output) + bias_output


def batch_results(features, labels, parameters):
    logits = forward(features, parameters)
    # Эта функция объединяет softmax и сравнение с целыми метками устойчиво.
    losses = tf.nn.sparse_softmax_cross_entropy_with_logits(
        labels=labels, logits=logits
    )
    classes = tf.argmax(logits, axis=1, output_type=tf.int32)
    correct = tf.reduce_sum(tf.cast(tf.equal(classes, labels), tf.int32))
    return tf.reduce_sum(losses), correct, classes


def train_step(features, labels, parameters):
    with tf.GradientTape() as tape:
        logits = forward(features, parameters)
        # Loss сравнивает распределение, заданное логитами, с верным классом.
        losses = tf.nn.sparse_softmax_cross_entropy_with_logits(
            labels=labels, logits=logits
        )
        mean_loss = tf.reduce_mean(losses)
    # GradientTape находит производные loss по всем четырём переменным.
    gradients = tape.gradient(mean_loss, parameters)
    # Ручной шаг градиентного спуска: параметры движутся против градиента.
    for parameter, gradient in zip(parameters, gradients):
        parameter.assign_sub(LEARNING_RATE * gradient)

    classes = tf.argmax(logits, axis=1, output_type=tf.int32)
    correct = tf.reduce_sum(tf.cast(tf.equal(classes, labels), tf.int32))
    return tf.reduce_sum(losses), correct


def evaluate(features, labels, parameters):
    total_loss = tf.constant(0.0, tf.float32)
    total_correct = tf.constant(0, tf.int32)
    class_batches = []
    for start in range(0, int(labels.shape[0]), BATCH_SIZE):
        end = start + BATCH_SIZE
        loss_sum, correct, classes = batch_results(
            features[start:end], labels[start:end], parameters
        )
        total_loss += loss_sum
        total_correct += correct
        class_batches.append(classes)
    return (
        total_loss / tf.cast(tf.shape(labels)[0], tf.float32),
        tf.cast(total_correct, tf.float32) / tf.cast(tf.shape(labels)[0], tf.float32),
        tf.concat(class_batches, axis=0),
    )


def show_metrics(labels, classes):
    matrix = tf.math.confusion_matrix(labels, classes, num_classes=10, dtype=tf.int32)
    matrix_float = tf.cast(matrix, tf.float32)
    true_positive = tf.linalg.diag_part(matrix_float)
    # Строки — истинные классы, столбцы — предсказанные.
    actual_count = tf.reduce_sum(matrix_float, axis=1)
    predicted_count = tf.reduce_sum(matrix_float, axis=0)
    precision = tf.math.divide_no_nan(true_positive, predicted_count)
    recall = tf.math.divide_no_nan(true_positive, actual_count)
    f1 = tf.math.divide_no_nan(2.0 * precision * recall, precision + recall)
    overall_accuracy = tf.math.divide_no_nan(
        tf.reduce_sum(true_positive), tf.reduce_sum(matrix_float)
    )

    print("\nМатрица ошибок: строки — истинный класс, столбцы — предсказанный")
    for row in tf.unstack(matrix):
        print(" ".join(f"{int(value):5d}" for value in row))

    print("\nКласс  Precision  Recall     F1     Примеров")
    for digit in range(10):
        print(
            f"{digit:>5}  {float(precision[digit]):>9.4f}  "
            f"{float(recall[digit]):>6.4f}  {float(f1[digit]):>6.4f}  "
            f"{int(actual_count[digit]):>8}"
        )
    print(
        f"Macro  {float(tf.reduce_mean(precision)):>9.4f}  "
        f"{float(tf.reduce_mean(recall)):>6.4f}  "
        f"{float(tf.reduce_mean(f1)):>6.4f}"
    )
    print(f"Overall accuracy: {float(overall_accuracy):.4f}")


def main():
    tf.random.set_seed(SEED)
    print("TensorFlow seed = 42; полная воспроизводимость зависит от окружения.")
    print("Загрузка оригинального MNIST (IDX)...")
    train_images = read_images(get_archive("train-images-idx3-ubyte.gz"), 60000)
    train_labels = read_labels(get_archive("train-labels-idx1-ubyte.gz"), 60000)
    test_images = read_images(get_archive("t10k-images-idx3-ubyte.gz"), 10000)
    test_labels = read_labels(get_archive("t10k-labels-idx1-ubyte.gz"), 10000)
    describe_split("Обучение", train_images, train_labels)
    describe_split("Тест", test_images, test_labels)

    train_features = prepare_images(train_images)
    test_features = prepare_images(test_images)
    print(
        f"После подготовки: обучение {tuple(train_features.shape)}, "
        f"тест {tuple(test_features.shape)}; "
        f"пиксели обучения [{float(tf.reduce_min(train_features)):.1f}, "
        f"{float(tf.reduce_max(train_features)):.1f}]"
    )

    parameters = create_parameters()
    sample_count = int(train_labels.shape[0])
    for epoch in range(1, EPOCHS + 1):
        indices = tf.random.shuffle(tf.range(sample_count))
        loss_sum = tf.constant(0.0, tf.float32)
        correct_sum = tf.constant(0, tf.int32)
        for start in range(0, sample_count, BATCH_SIZE):
            batch_indices = indices[start : start + BATCH_SIZE]
            features = tf.gather(train_features, batch_indices)
            labels = tf.gather(train_labels, batch_indices)
            batch_loss, batch_correct = train_step(features, labels, parameters)
            loss_sum += batch_loss
            correct_sum += batch_correct
        print(
            f"Эпоха {epoch}/{EPOCHS}: "
            f"training loss = {float(loss_sum / sample_count):.4f}, "
            f"training accuracy = {float(correct_sum / sample_count):.4f}"
        )

    test_loss, test_accuracy, test_classes = evaluate(
        test_features, test_labels, parameters
    )
    print(
        f"\nТест: loss = {float(test_loss):.4f}, "
        f"accuracy = {float(test_accuracy):.4f}"
    )
    show_metrics(test_labels, test_classes)

    print("\nПримеры: истинная метка -> выбранный класс")
    for index in range(10):
        actual = int(test_labels[index])
        chosen = int(test_classes[index])
        mark = "верно" if actual == chosen else "ошибка"
        print(f"№{index}: {actual} -> {chosen} ({mark})")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(f"Ошибка данных MNIST: {error}", file=sys.stderr)
        sys.exit(1)


# Итого: IDX разбирается без сторонних загрузчиков; параметры — tf.Variable.
# Предсказанный класс — argmax логитов: softmax меняет масштаб, но не порядок.
# Градиенты вычисляет GradientTape, обновление весов выполняется вручную.
# Матрица ошибок даёт TP, FP и FN для метрик каждого класса.
