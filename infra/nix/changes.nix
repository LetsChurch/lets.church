# Update the imports to include the other file in this directory
imports =
  [ # Include the results of the hardware scan.
    ./hardware-configuration.nix
    # Let's Church configuration
    ./letschurch.nix
  ];

# Update hostname and firewall settings
networking.hostName = "saphar";
networking.firewall.allowedTCPPorts = [ 22 ];

# Define a user account. Don't forget to set a password with ‘passwd’.
users.users.username = {
  isNormalUser = true;
  description = "User's Name";
  extraGroups = [ "networkmanager" "wheel" "docker" ];
  packages = with pkgs; [];
};
