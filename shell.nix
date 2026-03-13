# generate the sha256 like this:
# nix-prefetch-url --unpack https://github.com/nixos/nixpkgs/archive/de6d4da6dfb6e16bc181a603674e3f5b5cda0bdf.tar.gz
# Using the sha256 prevents re-fetching and/or checking etag from the network

let
  nixpkgs = fetchTarball {
    url = "https://github.com/nixos/nixpkgs/archive/de6d4da6dfb6e16bc181a603674e3f5b5cda0bdf.tar.gz";
    sha256 = "1miwvi498qa1275qfn08hci28asbv0sahd59vnvsxzb9dgd945jx";
  };
  pkgs = import nixpkgs { config = {}; overlays = []; };
in 

pkgs.mkShell {
  packages = with pkgs; [
    uv
    bun
    docker-compose
    fd
    git-lfs
    go
    gum
    just
    kubectl
    kustomize
    lazydocker
    navi
    nodejs_23
    pnpm
    rclone
    sampler
    templ
    unixtools.xxd
  ];
  shellHook = ''
    (cd infra/ansible && uv sync --quiet)
    source infra/ansible/.venv/bin/activate
  '';
}
