# generate the sha256 like this:
# nix-prefetch-url --unpack https://github.com/NixOS/nixpkgs/archive/47b604b07d1e8146d5398b42d3306fdebd343986.tar.gz

with (import (fetchTarball {
  url = "https://github.com/nixos/nixpkgs/archive/47b604b07d1e8146d5398b42d3306fdebd343986.tar.gz";
  sha256 = "0g0nl5dprv52zq33wphjydbf3xy0kajp0yix7xg2m0qgp83pp046";
}) {});

mkShell {
  packages = [
    ansible
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
    rclone
    sampler
    transcrypt
    unixtools.xxd
  ];
}
