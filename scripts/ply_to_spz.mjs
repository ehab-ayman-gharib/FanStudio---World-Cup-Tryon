import fs from 'fs/promises';
import { transcodeSpz } from '@sparkjsdev/spark';

async function main() {
    const inputPath = process.argv[2];
    const outputPath = process.argv[3];

    if (!inputPath || !outputPath) {
        console.error('Usage: node ply_to_spz.mjs <input.ply> <output.spz>');
        process.exit(1);
    }

    try {
        const fileBytes = await fs.readFile(inputPath);
        const result = await transcodeSpz({
            inputs: [{ fileBytes: new Uint8Array(fileBytes), pathOrUrl: inputPath }]
        });
        
        await fs.writeFile(outputPath, Buffer.from(result.fileBytes));
        console.log('Successfully converted');
    } catch (err) {
        console.error('Error during conversion:', err);
        process.exit(1);
    }
}

main();
