import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../lib/password.js';

// Genera el valor de APP_PASSWORD_HASH para el .env.
// Uso: pnpm hash-password  (pide la contraseña por consola; no queda en el historial)

const MIN_LENGTH = 10;

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    // Permite: echo "clave" | pnpm hash-password
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Oculta lo que se escribe
  const output = rl as unknown as { _writeToOutput: (text: string) => void };
  const originalWrite = output._writeToOutput.bind(rl);
  let prompting = true;
  output._writeToOutput = (text: string) => {
    originalWrite(prompting && !text.startsWith('Contraseña') ? '' : text);
  };
  const password = await rl.question('Contraseña: ');
  prompting = false;
  rl.close();
  process.stdout.write('\n');
  return password;
}

const password = await readPassword();
if (password.length < MIN_LENGTH) {
  console.error(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres`);
  process.exit(1);
}
console.log(`APP_PASSWORD_HASH=${await hashPassword(password)}`);
