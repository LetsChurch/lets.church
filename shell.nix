# generate the sha256 like this:
# nix-prefetch-url --unpack https://github.com/NixOS/nixpkgs/archive/f44ba1be526c8da9e79a5759feca2365204003f6.tar.gz

with (import (fetchTarball {
  url = "https://github.com/nixos/nixpkgs/archive/f44ba1be526c8da9e79a5759feca2365204003f6.tar.gz";
  sha256 = "0npbwsdjw88py5w2pjflwh94wgi4jmnmls0k1n7q8m6h94w1y1ps";
}) {});

mkShell {
  packages = [
    fd
    just
    lazydocker
    navi
    nodejs-18_x
  ];
}
