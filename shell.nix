# generate the sha256 like this:
# nix-prefetch-url --unpack https://github.com/nixos/nixpkgs/archive/64d83f2b8c6efbbc41e94ebb146a3e92b347e0a5.tar.gz
# Using the sha256 prevents re-fetching and/or checking etag from the network

let
  nixpkgs = fetchTarball {
    url = "https://github.com/nixos/nixpkgs/archive/64d83f2b8c6efbbc41e94ebb146a3e92b347e0a5.tar.gz";
    sha256 = "1dxzicwfbz0l03snjil8bqxcmnzr44nnhv2m1qpqawp5lg2anzkf";
  };
  pkgs = import nixpkgs { config = {}; overlays = []; };
in 

pkgs.mkShell {
  packages = with pkgs; [
    uv
    bun
    docker-compose
    fd
    ffmpeg
    git-lfs
    go
    gum
    just
    kubectl
    kustomize
    lazydocker
    navi
    nodejs
    pnpm
    rclone
    ruff
    sampler
    templ
    unixtools.xxd
  ];
  shellHook = ''
    (cd infra/ansible && uv sync --quiet)
    source infra/ansible/.venv/bin/activate
  '';
}
