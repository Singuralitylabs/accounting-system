#!/usr/bin/env bash
# Bring up the Docker daemon inside the Cloud Agent VM (no systemd).
# Idempotent: safe to run on every boot and multiple times.
set -euo pipefail

# --- Install Docker if the binary is missing (defensive; normally baked in) ---
if ! command -v dockerd >/dev/null 2>&1; then
  echo "[docker-up] Installing Docker Engine..."
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
    sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# fuse-overlayfs is required because the nested VM cannot use the default
# overlayfs storage driver (overlay mounts fail with EINVAL).
if ! command -v fuse-overlayfs >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fuse-overlayfs || true
fi

# --- Configure the daemon to use fuse-overlayfs (containerd snapshotter off) ---
sudo mkdir -p /etc/docker
if ! grep -q "fuse-overlayfs" /etc/docker/daemon.json 2>/dev/null; then
  echo '{ "storage-driver": "fuse-overlayfs", "features": { "containerd-snapshotter": false } }' |
    sudo tee /etc/docker/daemon.json >/dev/null
fi

# --- Start the daemon if it is not already listening ---
if ! sudo docker info >/dev/null 2>&1; then
  echo "[docker-up] Starting dockerd..."
  sudo bash -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'
  for i in $(seq 1 30); do
    if sudo docker info >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi
sudo docker info >/dev/null 2>&1 || { echo "[docker-up] dockerd failed to start"; sudo tail -n 40 /var/log/dockerd.log || true; exit 1; }

# --- Fix nested-VM bridge networking ---
# With bridge-nf-call-iptables=1, same-bridge container traffic is routed
# through the (broken) iptables FORWARD chain and dropped, so containers such
# as Supabase's Realtime service cannot reach Postgres. Disabling it lets
# bridged traffic bypass iptables. Must be re-applied every boot.
for f in bridge-nf-call-iptables bridge-nf-call-ip6tables bridge-nf-call-arptables; do
  if [ -w "/proc/sys/net/bridge/$f" ] || sudo test -e "/proc/sys/net/bridge/$f"; then
    echo 0 | sudo tee "/proc/sys/net/bridge/$f" >/dev/null 2>&1 || true
  fi
done

# Grant the Cloud Agent user access to the daemon. Do not chmod 666 — a
# world-writable socket would give every local account root-equivalent
# control through the Docker API. Group membership from usermod does not
# apply to this already-running shell, so own the socket as that user.
DOCKER_USER="$(id -un)"
getent group docker >/dev/null || sudo groupadd docker
sudo usermod -aG docker "$DOCKER_USER" 2>/dev/null || true
sudo chown "$DOCKER_USER":docker /var/run/docker.sock
sudo chmod 660 /var/run/docker.sock

echo "[docker-up] Docker is ready (storage-driver=$(sudo docker info --format '{{.Driver}}'))."
