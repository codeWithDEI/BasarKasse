#!/bin/sh
set -eu
. /etc/basarkasse/ops.env
exec docker run --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m --cpus 0.25 --user 1000:1000 --tmpfs /tmp:size=16m \
 --mount "type=bind,source=$BASAR_OPS_ROOT/backups,target=/backups,readonly" \
 --mount "type=bind,source=$BASAR_OPS_ROOT/state,target=/state" \
 "$BASAR_BACKUP_IMAGE" node selfhost/ops-server.mjs ack
