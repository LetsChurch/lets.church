# generate the sha256 like this:
# nix-prefetch-url --unpack https://github.com/NixOS/nixpkgs/archive/2b2a5687de6e2b016e3ba5b95b51f4d5a840a28a.tar.gz

with (import (fetchTarball {
  url = "https://github.com/nixos/nixpkgs/archive/2b2a5687de6e2b016e3ba5b95b51f4d5a840a28a.tar.gz";
  sha256 = "0gnakh6cd9k16haqdsrdnk77sniyk7ncy6fpkvb1m1zxlj5y2ndx";
}) {});

mkShell {
  packages = [
    fd
    git-lfs
    gitleaks
    just
    kubectl
    kustomize
    lazydocker
    navi
    nodejs_20
    rclone
    transcrypt
    unixtools.xxd
  ];
}
