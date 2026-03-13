import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as os from 'os';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const extensionTestsPath = path.resolve(__dirname, './index');

    // On macOS, @vscode/test-electron resolves to Contents/MacOS/Electron which
    // rejects all CLI flags on newer signed builds. Use the code CLI wrapper instead.
    let vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
    if (os.platform() === 'darwin') {
      vscodeExecutablePath = vscodeExecutablePath.replace(
        /Contents\/MacOS\/Electron$/,
        'Contents/Resources/app/bin/code'
      );
    }

    await runTests({ extensionDevelopmentPath, extensionTestsPath, vscodeExecutablePath });
  } catch (err) {
    console.error('Failed to run integration tests:', err);
    process.exit(1);
  }
}

main();
