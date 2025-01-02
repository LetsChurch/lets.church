# generate the sha256 like this:
# nix-prefetch-url --unpack https://github.com/NixOS/nixpkgs/archive/fd4ca2fcd587216ca1a023643c078f55cd32272f.tar.gz

with (import (fetchTarball {
  url = "https://github.com/NixOS/nixpkgs/archive/fd4ca2fcd587216ca1a023643c078f55cd32272f.tar.gz";
  sha256 = "0s4p9kq93900nbg01jkk9qrv5iyzdgc3xxashjb5kgpkz3zrfwii";
}) {});

mkShell {
  packages = [
    ansible
    bun
    docker-compose
    fd
    git-lfs
    gitleaks
    go
    just
    kubectl
    kustomize
    lazydocker
    navi
    nodejs_20
    postgresql_14
    rclone
    sampler
    templ
    transcrypt
    unixtools.xxd
  ];
}
