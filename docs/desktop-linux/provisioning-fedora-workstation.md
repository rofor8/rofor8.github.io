---
sidebar_position: 4
---

# Provisioning Fedora Workstation

This script installs and updates various packages and tools on a Fedora system. It installs the PostgreSQL database management system, the RPM Fusion repositories, and the Flathub repository. It also updates the system's packages and firmware, installs the Gnome Tweak Tool, some tools for working with CoreOS, and sets some configuration options for dnf (the Fedora package manager).

``` bash
#!/bin/bash

# Set Fedora version
FEDORA_VER=$(rpm -E %fedora)

# Remove any old pgadmin repos
sudo rpm -e pgadmin4-fedora-repo

# Set URLs for RPM Fusion repositories
FREE_REPO_URL="https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-${FEDORA_VER}.noarch.rpm"
NONFREE_REPO_URL="https://download1.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-${FEDORA_VER}.noarch.rpm"

# Set URL for pgAdmin4 repository
PGADMIN_REPO_URL="https://ftp.postgresql.org/pub/pgadmin/pgadmin4/yum/pgadmin4-fedora-repo-2-1.noarch.rpm"

# Set dnf configuration options
echo 'max_parallel_downloads=10' | sudo tee -a /etc/dnf/dnf.conf
echo 'fastestmirror=True' | sudo tee -a /etc/dnf/dnf.conf

# Add the PostgreSQL repository
sudo rpm -i "$PGADMIN_REPO_URL"

# Install RPM Fusion repositories
sudo dnf install "$FREE_REPO_URL" "$NONFREE_REPO_URL"

# Add Flathub repository
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo

# Update and upgrade packages
sudo dnf update && sudo dnf upgrade

# Refresh package list and update core packages
sudo dnf upgrade --refresh
sudo dnf groupupdate core

# Update firmware
sudo fwupdmgr refresh --force
sudo fwupdmgr get-updates
sudo fwupdmgr update


# Install Qgis
sudo dnf install qgis python3-qgis qgis-grass qgis-server


# Install ranger
sudo dnf ranger

# Install psql
sudo dnf psql


# Install dnf-plugins-core
sudo dnf install dnf-plugins-core

# Add the Brave browser repository
sudo dnf config-manager --add-repo https://brave-browser-rpm-release.s3.brave.com/brave-browser.repo

# Import the Brave browser's key
sudo rpm --import https://brave-browser-rpm-release.s3.brave.com/brave-core.asc

# Install the Brave browser
sudo dnf install brave-browser

# Import the Microsoft key
sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc

# Add the Visual Studio Code repository
sudo sh -c 'echo -e "[code]\nname=Visual Studio Code\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\nenabled=1\ngpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc" > /etc/yum.repos.d/vscode.repo'

# Check for updates
dnf check-update

# Install Visual Studio Code
sudo dnf install code

# Set the global git user name and email
git config --global user.name "user"
git config --global user.email email

# Remove nano-default-editor
sudo dnf remove nano-default-editor

# Reinstall the package vim-default-editor
sudo dnf install vim-default-editor

# Install gnome-shell-extensions package ed
sudo dnf install gnome-shell-extensions

# Install gimp
sudo dnf install gimp

sudo dnf install xclip

sudo dnf install yarn

git config --global user.name "rofor8"
git config --global user.email "rofor8@gmail.com"

ssh-keygen -t rsa -b 4096 -C "rofor8@gmail.com"
ssh-add ~/.ssh/id_rs
xclip -sel clip < ~/.ssh/id_rsa.pub
