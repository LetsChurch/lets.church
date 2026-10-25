# generate the sha256 like this:
# nix-prefetch-url --unpack https://github.com/nixos/nixpkgs/archive/3ec636362e1816bc2f0888fa0fa2c69f1bc9e504.tar.gz
# Using the sha256 prevents re-fetching and/or checking etag from the network

let
  nixpkgs = fetchTarball {
    url = "https://github.com/nixos/nixpkgs/archive/3ec636362e1816bc2f0888fa0fa2c69f1bc9e504.tar.gz";
    sha256 = "177diqkiwphjyqpk2n6nisayx840x28ksvq99kkyi2xsn37fp4md";
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
    # Local CA + certificates for https://*.localhost (docs/worktrees.md);
    # nssTools lets `mkcert -install` trust it in Firefox too.
    mkcert
    navi
    nssTools
    nodejs
    pnpm
    rclone
    ruff
    sampler
    templ
    unixtools.xxd
    worktrunk
  ];
  # infra/ is a separate checkout that only the primary worktree has.
  shellHook = ''
    if [ -d infra/ansible ]; then
      (cd infra/ansible && uv sync --quiet)
      source infra/ansible/.venv/bin/activate
    fi
  '';
}
