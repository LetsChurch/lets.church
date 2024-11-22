# generate the sha256 like this:
# nix-prefetch-url --unpack https://github.com/NixOS/nixpkgs/archive/47b604b07d1e8146d5398b42d3306fdebd343986.tar.gz

with (import (fetchTarball {
  url = "https://github.com/nixos/nixpkgs/archive/df7cef32c3494ca95363e119160be6960022b0fd.tar.gz";
  sha256 = "1spja94f8i1y8nnpasc9dj583w7dp15yl217q8i49dcar0mj52nk";
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
