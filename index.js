import { spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CommandExecutor extends EventEmitter {
  execute(command) {
    const result = spawnSync(command, { shell: true });

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (result.status !== 0) {
      const stderr = result.stderr.toString();
      throw new Error(`Command failed with exit code ${result.status}: ${stderr}`);
    }

    return result.stdout.toString();
  }
}

export async function runCommands(audioBuffer) {
  const commandExecutor = new CommandExecutor();
  
  // Use OS temp directory for safer operations
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `input_${Date.now()}.wav`);
  const outputPath = path.join(tempDir, `processed_${Date.now()}.wav`);
  const outputPathJSON = path.join(tempDir, `output_${Date.now()}.json`);

  // Locate the binary based on OS
  const isWindows = process.platform === 'win32';
  const toolsDir = path.join(__dirname, '.tools');
  
  let rhubarbBinary;
  if (isWindows) {
    rhubarbBinary = path.join(toolsDir, 'Rhubarb-Lip-Sync-1.14.0-Windows', 'rhubarb.exe');
  } else {
    // Fallback for Linux if it still existed
    rhubarbBinary = path.join(toolsDir, 'rhubarb-Lip-Sync-1.13.0-Linux', 'rhubarb');
  }

  try {
    console.log("STARTING PROCESS....");
    console.time("rhubarb-process");

    // Write audioBuffer to a temporary file
    await fs.promises.writeFile(tempFilePath, audioBuffer);

    // FFmpeg command to convert the temporary file to WAV format (Rhubarb requires specific WAV)
    const ffmpegCommand = `ffmpeg -y -i "${tempFilePath}" -acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}"`;

    // Execute FFmpeg command
    await commandExecutor.execute(ffmpegCommand);

    // Execute Rhubarb command
    const rhubarbCommand = `"${rhubarbBinary}" -r phonetic -f json "${outputPath}" -o "${outputPathJSON}"`;
 
    await commandExecutor.execute(rhubarbCommand);
 
    // Read the contents of the output JSON file
    const outputJSONContent = await fs.promises.readFile(outputPathJSON, 'utf-8');
    console.timeEnd("rhubarb-process");

    return outputJSONContent;
  } catch (error) {
    console.error('Error executing command:', error.message);
    throw error;
  } finally {
    // Cleanup: Remove temporary and output files
    const filesToDelete = [tempFilePath, outputPath, outputPathJSON];
    for (const file of filesToDelete) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file);
        }
      } catch (error) {
        console.error(`Error removing temporary file ${file}:`, error.message);
      }
    }
  }
}

export default CommandExecutor
