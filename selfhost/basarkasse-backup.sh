#!/bin/sh
set -eu
. /etc/basarkasse/ops.env
exec docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 256m --cpus 0.25 --user 1000:1000 --tmpfs /tmp:size=32m \
 --mount "type=volume,source=$BASAR_BACKUP_VOLUME,target=/data,readonly" \
 --mount "type=bind,source=$BASAR_OPS_ROOT/backups,target=/backups" \
 --mount "type=bind,source=$BASAR_OPS_ROOT/state,target=/state" \
 --mount "type=bind,source=$BASAR_OPS_CODE,target=/operations,readonly" \
 "$BASAR_BACKUP_IMAGE" node /operations/ops-server.mjs snapshot
