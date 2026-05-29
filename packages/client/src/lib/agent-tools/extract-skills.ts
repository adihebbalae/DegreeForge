import { ToolDefinition, ToolResult } from './types';

// Map common terms to skill keys
const ALIAS_MAP: Record<string, string> = {
  'ml': 'machine_learning',
  'machine learning': 'machine_learning',
  'ai': 'machine_learning',
  'artificial intelligence': 'machine_learning',
  'deep learning': 'machine_learning',
  'embedded': 'embedded_systems',
  'embedded systems': 'embedded_systems',
  'firmware': 'embedded_systems',
  'microcontroller': 'embedded_systems',
  'mcu': 'embedded_systems',
  'computer architecture': 'computer_architecture',
  'architecture': 'computer_architecture',
  'dsp': 'digital_signal_processing',
  'signal processing': 'digital_signal_processing',
  'digital signal processing': 'digital_signal_processing',
  'vlsi': 'vlsi_design',
  'asic': 'vlsi_design',
  'power electronics': 'power_electronics',
  'power': 'power_electronics',
  'telecommunications': 'telecommunications',
  'telecom': 'telecommunications',
  'communications': 'telecommunications',
  'control systems': 'control_systems',
  'controls': 'control_systems',
  'networking': 'computer_networking',
  'networks': 'computer_networking',
  'software engineering': 'software_engineering',
  'swe': 'software_engineering',
  'software': 'software_engineering',
  'data structures': 'data_structures',
  'algorithms': 'data_structures',
  'circuit design': 'circuit_design',
  'circuits': 'circuit_design',
  'fpga': 'fpga_design',
  'verilog': 'fpga_design',
  'vhdl': 'fpga_design',
  'robotics': 'robotics',
  'image processing': 'image_processing',
  'computer vision': 'image_processing',
  'cv': 'image_processing',
  'cybersecurity': 'cybersecurity',
  'security': 'cybersecurity',
  'infosec': 'cybersecurity',
  'iot': 'iot',
  'internet of things': 'iot',
  'analog design': 'analog_design',
  'analog': 'analog_design',
  'pcb': 'analog_design',
  'rf': 'rf_engineering',
  'radio frequency': 'rf_engineering',
  'semiconductor': 'semiconductor_physics',
  'semiconductors': 'semiconductor_physics',
  'physics': 'semiconductor_physics'
};

/**
 * Pure extraction function — deterministic, synchronous, no server required.
 * Uses word-boundary regex matching against ALIAS_MAP.
 */
export function extractSkills(text: string): string[] {
  const matchedKeys = new Set<string>();

  for (const [alias, key] of Object.entries(ALIAS_MAP)) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedAlias}\\b`, 'i');
    if (regex.test(text)) {
      matchedKeys.add(key);
    }
  }

  return Array.from(matchedKeys);
}

export const extractSkillsTool: ToolDefinition = {
  name: 'extract_skills',
  description: 'Extract standardized technical skills from a job description',
  schema: {
    type: 'object',
    properties: {
      job_description: {
        type: 'string',
        description: 'The full text of the job description'
      }
    },
    required: ['job_description']
  },
  defaultEnabled: false,
  fn: (_ctx, args: Record<string, unknown>): ToolResult => {
    const text = typeof args.job_description === 'string' ? args.job_description : '';
    return { content: { skills: extractSkills(text) } };
  }
};
