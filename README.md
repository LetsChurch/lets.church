# lets.church

## Setup

1. Install [`git-lfs`], [Docker](https://www.docker.com/products/docker-desktop/), [`direnv`], and [`nix`]
1. Clone this repo
1. Copy `.envrc.local.example` to `.envrc.local` and update the variables to actual values
1. Run `direnv allow` to load the shell environment and `nix` packages
1. Run `just start` to start the `docker-compose` setup
1. Run `just init` to migrate the database and set up ElasticSearch
1. Run `just seed` to seed the database with sample data and upload sample data to S3
1. Run `just open` to open the web interface

[Docker]: https://www.docker.com/products/docker-desktop/
[`direnv`]: https://direnv.net/
[`git-lfs`]: https://git-lfs.github.com/
[`nix`]: https://nixos.org/download.html
