/**
 * DEPENDENCY DOWNLOADER
 * 
 * Phase 10: The 30-Second Experience
 * 
 * Downloads optional dependencies on first run:
 * - Piper TTS (executable + voice model)
 * 
 * This runs in Electron main process and downloads real files
 * from real URLs. No fake bundling.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream/promises');
const { createWriteStream, mkdirSync, existsSync } = require('fs');
const { execSync, spawn } = require('child_process');
const os = require('os');

// ============================================================================
// DOWNLOAD URLS - These are REAL URLs to REAL files
// ============================================================================

const PIPER_RELEASES = {
  win32: {
    url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
    filename: 'piper_windows_amd64.zip',
    executable: 'piper.exe',
  },
  darwin: {
    url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_x64.tar.gz',
    filename: 'piper_macos_x64.tar.gz',
    executable: 'piper',
  },
  linux: {
    url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz',
    filename: 'piper_linux_x86_64.tar.gz',
    executable: 'piper',
  },
};

// Recommended voice model (medium quality, good balance)
const PIPER_VOICE = {
  model: {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    filename: 'en_US-lessac-medium.onnx',
  },
  config: {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json',
    filename: 'en_US-lessac-medium.onnx.json',
  },
};

// ============================================================================
// DOWNLOAD HELPERS
// ============================================================================

/**
 * Download a file with progress callback
 */
async function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    console.log(`[Download] Starting: ${url}`);
    console.log(`[Download] Destination: ${destPath}`);
    
    // Ensure directory exists
    const dir = path.dirname(destPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    const file = createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, { 
      headers: { 
        'User-Agent': 'JARVIS-Setup/2.0',
      },
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location, destPath, onProgress)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;
      
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (onProgress && totalBytes) {
          onProgress(downloadedBytes, totalBytes);
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`[Download] Complete: ${destPath}`);
        resolve(destPath);
      });
    });
    
    request.on('error', (err) => {
      file.close();
      if (existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
    
    file.on('error', (err) => {
      file.close();
      if (existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Extract archive (zip or tar.gz)
 */
async function extractArchive(archivePath, destDir) {
  console.log(`[Extract] Extracting: ${archivePath} to ${destDir}`);
  
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  
  const platform = process.platform;
  
  if (archivePath.endsWith('.zip')) {
    // Use PowerShell on Windows, unzip on others
    if (platform === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, {
        stdio: 'inherit',
      });
    } else {
      execSync(`unzip -o "${archivePath}" -d "${destDir}"`, {
        stdio: 'inherit',
      });
    }
  } else if (archivePath.endsWith('.tar.gz')) {
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, {
      stdio: 'inherit',
    });
  }
  
  console.log(`[Extract] Complete`);
}

// ============================================================================
// MAIN DOWNLOADER CLASS
// ============================================================================

class DependencyDownloader {
  constructor(appPath) {
    // App path is where JARVIS is installed
    this.appPath = appPath || process.cwd();
    this.piperPath = path.join(this.appPath, 'electron', 'tts', 'piper');
    this.tempPath = path.join(os.tmpdir(), 'jarvis-setup');
    
    // Ensure temp directory exists
    if (!existsSync(this.tempPath)) {
      mkdirSync(this.tempPath, { recursive: true });
    }
  }
  
  /**
   * Check if Piper is installed
   */
  isPiperInstalled() {
    const platform = process.platform;
    const release = PIPER_RELEASES[platform];
    if (!release) return false;
    
    const execPath = path.join(this.piperPath, release.executable);
    const modelPath = path.join(this.piperPath, PIPER_VOICE.model.filename);
    const configPath = path.join(this.piperPath, PIPER_VOICE.config.filename);
    
    return existsSync(execPath) && existsSync(modelPath) && existsSync(configPath);
  }
  
  /**
   * Download and install Piper TTS
   */
  async installPiper(onProgress) {
    const platform = process.platform;
    const release = PIPER_RELEASES[platform];
    
    if (!release) {
      throw new Error(`Piper not available for platform: ${platform}`);
    }
    
    const steps = [
      { name: 'Downloading Piper...', weight: 50 },
      { name: 'Extracting Piper...', weight: 10 },
      { name: 'Downloading voice model...', weight: 35 },
      { name: 'Downloading voice config...', weight: 5 },
    ];
    
    let completedWeight = 0;
    
    const reportProgress = (stepIndex, stepProgress = 100) => {
      const stepWeight = steps[stepIndex].weight;
      const totalProgress = completedWeight + (stepWeight * stepProgress / 100);
      if (onProgress) {
        onProgress({
          step: steps[stepIndex].name,
          progress: Math.round(totalProgress),
        });
      }
    };
    
    try {
      // Step 1: Download Piper executable
      reportProgress(0, 0);
      const archivePath = path.join(this.tempPath, release.filename);
      await downloadFile(release.url, archivePath, (downloaded, total) => {
        reportProgress(0, (downloaded / total) * 100);
      });
      completedWeight += steps[0].weight;
      
      // Step 2: Extract Piper
      reportProgress(1, 0);
      if (!existsSync(this.piperPath)) {
        mkdirSync(this.piperPath, { recursive: true });
      }
      await extractArchive(archivePath, this.piperPath);
      
      // Move files from nested directory if needed
      const nestedDir = path.join(this.piperPath, 'piper');
      if (existsSync(nestedDir)) {
        const files = fs.readdirSync(nestedDir);
        for (const file of files) {
          fs.renameSync(
            path.join(nestedDir, file),
            path.join(this.piperPath, file)
          );
        }
        fs.rmdirSync(nestedDir);
      }
      
      // Make executable on Unix
      if (platform !== 'win32') {
        const execPath = path.join(this.piperPath, release.executable);
        if (existsSync(execPath)) {
          execSync(`chmod +x "${execPath}"`);
        }
      }
      
      completedWeight += steps[1].weight;
      reportProgress(2, 0);
      
      // Step 3: Download voice model
      const modelPath = path.join(this.piperPath, PIPER_VOICE.model.filename);
      await downloadFile(PIPER_VOICE.model.url, modelPath, (downloaded, total) => {
        reportProgress(2, (downloaded / total) * 100);
      });
      completedWeight += steps[2].weight;
      
      // Step 4: Download voice config
      reportProgress(3, 0);
      const configPath = path.join(this.piperPath, PIPER_VOICE.config.filename);
      await downloadFile(PIPER_VOICE.config.url, configPath, (downloaded, total) => {
        reportProgress(3, (downloaded / total) * 100);
      });
      completedWeight += steps[3].weight;
      
      // Clean up temp files
      if (existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
      
      console.log('[DependencyDownloader] Piper installation complete');
      return true;
      
    } catch (error) {
      console.error('[DependencyDownloader] Piper installation failed:', error);
      throw error;
    }
  }
  
  /**
   * Get installation status
   */
  getStatus() {
    return {
      piper: {
        installed: this.isPiperInstalled(),
        path: this.piperPath,
      },
    };
  }
}

module.exports = { DependencyDownloader, downloadFile, extractArchive };
