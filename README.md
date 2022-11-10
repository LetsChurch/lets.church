# lets.church

## Setup

1. Install [Docker](https://www.docker.com/products/docker-desktop/), [`direnv`], and [`nix`]
1. Clone this repo
1. Run `direnv allow` to load the shell environment and `nix` packages
1. Run `just start` to start the `docker-compose` setup
1. Run `just init` to migrate the databases and set up ElasticSearch
1. Run `just seed` to seed the databases with sample data
1. Run `just open` to open the web interface

[Docker]: https://www.docker.com/products/docker-desktop/
[`direnv`]: https://direnv.net/
[`nix`]: https://nixos.org/download.html
