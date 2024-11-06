{ config, pkgs, ... }:

{
  nixpkgs.config.allowUnfree = true;

  environment.systemPackages = with pkgs; [
    cudaPackages.cudnn
    direnv
    docker
    docker-compose
    ffmpeg
    git
    htop
    lazydocker
    neovim
    nvidia-container-toolkit
    python310
    python310Packages.pip
    tailscale
    virtualenv
    zlib
  ];

  services.tailscale.enable = true;
  services.xserver.videoDrivers = ["nvidia"];

  hardware.opengl = {
    enable = true;
    driSupport = true;
    driSupport32Bit = true;
    setLdLibraryPath = true;
  };

  hardware.nvidia-container-toolkit.enable = true;

  virtualisation.docker = {
    enable = true;
    enableOnBoot = true;
  };
}
