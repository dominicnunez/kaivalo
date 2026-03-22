{
  description = "Kaivalo development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    nodejslts-nix = {
      url = "github:dominicnunez/nodejslts-nix";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flake-utils.follows = "flake-utils";
    };
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    nodejslts-nix,
  }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ nodejslts-nix.overlays.default ];
        };
        dockerCompat = pkgs.writeShellScriptBin "docker" ''
          exec ${pkgs.podman}/bin/podman "$@"
        '';
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejsLts
            pnpm
            git
            podman
            dockerCompat
            typescript-language-server
            svelte-language-server
            python3
            pkg-config
            gnumake
            gcc
          ];
        };
      });
}
