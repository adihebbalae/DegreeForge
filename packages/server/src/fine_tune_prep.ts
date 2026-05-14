import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const LOG_FILE = path.join(__dirname, '../ollama_log/history.jsonl');
const OUTPUT_FILE = path.join(__dirname, '../ollama_log/fine_tune_dataset.json');

interface ShareGPTConversation {
  from: 'system' | 'human' | 'gpt';
  value: string;
}

interface ShareGPTFormat {
  conversations: ShareGPTConversation[];
}

async function processLogs() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error(`Log file not found: ${LOG_FILE}`);
    process.exit(1);
  }

  const dataset: ShareGPTFormat[] = [];
  const fileStream = fs.createReadStream(LOG_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const conversations: ShareGPTConversation[] = [];

      if (entry.type === 'chat') {
        const promptData = JSON.parse(entry.prompt);
        if (promptData.systemPrompt) {
          conversations.push({ from: 'system', value: promptData.systemPrompt });
        }
        if (promptData.messages && promptData.messages.length > 0) {
          // Flatten messages
          promptData.messages.forEach((msg: any) => {
            conversations.push({
              from: msg.role === 'user' ? 'human' : 'gpt',
              value: msg.content
            });
          });
        }
        // Append the final response from assistant
        conversations.push({ from: 'gpt', value: entry.response });
      } else if (entry.type === 'json') {
        // Recommend/Questionnaire endpoint
        conversations.push({
          from: 'system',
          value: 'You are an expert UT Austin ECE academic advisor. You must respond with ONLY valid JSON.'
        });
        conversations.push({ from: 'human', value: entry.prompt });
        conversations.push({ from: 'gpt', value: JSON.stringify(entry.response) });
      }

      if (conversations.length > 0) {
        dataset.push({ conversations });
      }
    } catch (e) {
      console.error('Skipping invalid JSON line:', e);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dataset, null, 2));
  console.log(`\n✅ Successfully generated fine-tuning dataset at:`);
  console.log(OUTPUT_FILE);
  console.log(`Total samples: ${dataset.length}`);
  console.log(`\nYou can now use this JSON file to train a LoRA adapter using tools like Unsloth or Axolotl!`);
}

processLogs().catch(console.error);
