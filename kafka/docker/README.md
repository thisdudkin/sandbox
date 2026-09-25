# Kafka 4 KRaft cluster

The stack runs three dedicated KRaft controllers, three dedicated brokers, and Kafka UI. The controller quorum and broker data use independent persistent volumes.

## Why the roles are separated

Dedicated controllers keep metadata consensus isolated from broker traffic, GC pauses, and disk pressure. They can be sized and rolled independently. Three controllers form an odd quorum that remains available after one controller fails; three brokers with replication factor `3` and `min.insync.replicas=2` keep acknowledged data safe after one broker fails.

Combined broker/controller nodes are useful for development or small non-critical installations. They are not the preferred topology for a production cluster.

## Start

The Compose file uses fixed image tags and has `pull_policy: never`, so it never downloads or rebuilds images.

```bash
cd docker
docker image inspect apache/kafka:4.0.2 ghcr.io/kafbat/kafka-ui:v1.5.0
docker compose config --quiet
docker compose up -d
docker compose ps
```

Kafka UI is available at <http://localhost:8080>. Host clients use `localhost:19092,localhost:19093,localhost:19094`. If clients run on another machine, replace `localhost` in each broker's `KAFKA_ADVERTISED_LISTENERS` value with a resolvable host name or IP.

Create topics explicitly because automatic topic creation is disabled:

```bash
docker compose exec broker-1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server broker-1:9092 \
  --create --topic events --partitions 6 --replication-factor 3 \
  --config min.insync.replicas=2
```

## Operations

```bash
# Quorum state
docker compose exec controller-1 /opt/kafka/bin/kafka-metadata-quorum.sh \
  --bootstrap-controller controller-1:9093 describe --status

# Broker/API state
docker compose exec broker-1 /opt/kafka/bin/kafka-broker-api-versions.sh \
  --bootstrap-server broker-1:9092

# Stop without deleting data
docker compose down
```

Do not run `docker compose down --volumes` unless the entire cluster and all Kafka data must be destroyed.

## Production boundary

This configuration provides production-oriented Kafka topology, durability defaults, resource bounds, health checks, graceful shutdown, and persistent storage. A single Docker host is still one failure domain. For an actual production deployment, place controllers and brokers on separate hosts or availability zones and add TLS/SASL, secrets management, backups, monitoring/alerting, and host-level disk/capacity planning. Do not expose the current PLAINTEXT listener to an untrusted network; terminate it on a private network or add TLS/SASL before doing so.
