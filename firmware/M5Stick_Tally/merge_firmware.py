#!/usr/bin/env python3
"""
Post-build script for M5Stick CPlus 1.1 Tally Hub firmware
Automatically generates merged firmware file after successful build
"""

import os
import subprocess
import sys
from pathlib import Path

Import("env", "projenv")

def merge_firmware(source, target, env):
    """Merge bootloader, partitions, and firmware into a single file"""
    
    # Get the actual build directory path (resolve variables)
    build_dir = str(env.subst("$BUILD_DIR"))
    project_dir = str(env.subst("$PROJECT_DIR"))
    
    # Define file paths - they are directly in the build directory
    bootloader_path = os.path.join(build_dir, "bootloader.bin")
    partitions_path = os.path.join(build_dir, "partitions.bin")
    firmware_path = os.path.join(build_dir, "firmware.bin")
    merged_path = os.path.join(build_dir, "firmware-merged.bin")
    
    # Public firmware directory (for web flasher)
    # Decide output subfolder based on env name (to separate Plus2 vs Plus)
    pio_env = env.get("PIOENV", "")
    family_folder = "M5Stick_Tally_Plus2" if "plus2" in pio_env.lower() else "M5Stick_Tally"
    public_dir = os.path.join(project_dir, "..", "..", "public", "firmware", family_folder)
    public_merged_path = os.path.join(public_dir, "firmware-merged.bin")
    
    print("\n" + "="*50)
    print("🔧 M5StickC Firmware Merge Process (env: %s)" % pio_env)
    print("="*50)
    print(f"📂 Build directory: {build_dir}")
    print(f"📂 Project directory: {project_dir}")
    print(f"📂 Public directory: {public_dir}")
    
    # Check if all required files exist
    required_files = [
        (bootloader_path, "bootloader.bin"),
        (partitions_path, "partitions.bin"), 
        (firmware_path, "firmware.bin")
    ]
    
    missing_files = []
    for file_path, name in required_files:
        if not os.path.exists(file_path):
            missing_files.append(name)
            print(f"❌ Missing: {file_path}")
        else:
            print(f"✅ Found: {file_path}")
            
    if missing_files:
        print(f"❌ Missing required files: {', '.join(missing_files)}")
        return
    
    # Print file sizes
    for file_path, name in required_files:
        size = os.path.getsize(file_path)
        print(f"📁 {name}: {size:,} bytes ({size/1024:.1f} KB)")
    
    try:
        # Try to use esptool to merge firmware
        cmd = [
            sys.executable, "-m", "esptool",
            "--chip", "esp32",
            "merge_bin",
            "-o", merged_path,
            "--flash_mode", "dio",
            "--flash_freq", "40m", 
            "--flash_size", "4MB",
            "0x1000", bootloader_path,   # ESP32 bootloader at 0x1000
            "0x8000", partitions_path,   # Partitions at 32KB
            "0x10000", firmware_path     # Firmware at 64KB
        ]
        
        print(f"🔨 Running: {' '.join(cmd[3:])}")  # Don't show full python path
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=build_dir)
        
        if result.returncode == 0:
            # Get merged file size
            merged_size = os.path.getsize(merged_path)
            print(f"✅ Merged firmware created: {merged_size:,} bytes ({merged_size/1024:.1f} KB)")
            
            # Copy to public directory for web flasher
            os.makedirs(public_dir, exist_ok=True)
            
            # Use cross-platform copy
            if os.name == 'nt':  # Windows
                subprocess.run(['copy', merged_path, public_merged_path], shell=True)
            else:  # Unix/Linux/macOS
                subprocess.run(['cp', merged_path, public_merged_path])
                
            if os.path.exists(public_merged_path):
                print(f"📋 Copied to web flasher: {public_merged_path}")
                print("🌐 Merged firmware available for web-based flashing!")
            else:
                print(f"⚠️  Warning: Could not copy to {public_merged_path}")
                
        else:
            print(f"❌ esptool merge failed:")
            print(f"   stdout: {result.stdout}")
            print(f"   stderr: {result.stderr}")
            
            # Fallback: Manual binary merge (basic concatenation with padding)
            print("🔄 Attempting manual merge as fallback...")
            manual_merge(bootloader_path, partitions_path, firmware_path, merged_path, public_merged_path, public_dir)
            
    except FileNotFoundError:
        print("❌ esptool not found, attempting manual merge...")
        manual_merge(bootloader_path, partitions_path, firmware_path, merged_path, public_merged_path, public_dir)
    except Exception as e:
        print(f"❌ Error during merge: {e}")
        print("🔄 Attempting manual merge as fallback...")
        manual_merge(bootloader_path, partitions_path, firmware_path, merged_path, public_merged_path, public_dir)

def manual_merge(bootloader_path, partitions_path, firmware_path, merged_path, public_merged_path, public_dir):
    """Manual firmware merge using binary concatenation with proper padding"""
    try:
        with open(merged_path, 'wb') as merged_file:
            # Pad to 0x1000 (4KB) before bootloader for ESP32
            merged_file.write(b'\xFF' * 0x1000)
            
            # Bootloader at 0x1000
            with open(bootloader_path, 'rb') as f:
                bootloader_data = f.read()
                merged_file.write(bootloader_data)
            
            # Pad to 0x8000 (32KB) for partitions
            current_size = 0x1000 + len(bootloader_data)
            pad_size = 0x8000 - current_size
            if pad_size > 0:
                merged_file.write(b'\xFF' * pad_size)
            
            # Partitions at 0x8000
            with open(partitions_path, 'rb') as f:
                partitions_data = f.read()
                merged_file.write(partitions_data)
            
            # Pad to 0x10000 (64KB) for firmware
            current_size = 0x8000 + len(partitions_data)
            pad_size = 0x10000 - current_size
            if pad_size > 0:
                merged_file.write(b'\xFF' * pad_size)
            
            # Firmware at 0x10000
            with open(firmware_path, 'rb') as f:
                firmware_data = f.read()
                merged_file.write(firmware_data)
        
        merged_size = os.path.getsize(merged_path)
        print(f"✅ Manual merge successful: {merged_size:,} bytes ({merged_size/1024:.1f} KB)")
        
        # Copy to public directory
        os.makedirs(public_dir, exist_ok=True)
        with open(merged_path, 'rb') as src, open(public_merged_path, 'wb') as dst:
            dst.write(src.read())
            
        print(f"📋 Copied to web flasher: {public_merged_path}")
        print("🌐 Merged firmware available for web-based flashing!")
        
    except Exception as e:
        print(f"❌ Manual merge failed: {e}")

    print("="*50)
    print("✨ Build Complete - Single-file firmware ready!")
    print("="*50 + "\n")

# Register the post-build callback
env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", merge_firmware)
