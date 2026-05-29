import { describe, it, expect } from 'vitest';
import { extractSkills, extractSkillsTool } from '../extract-skills';
import type { ToolContext } from '../types';

// ToolContext is unused at runtime; extractSkillsTool.fn ignores ctx.
const stubCtx = {} as ToolContext;

describe('extractSkillsTool', () => {
  const execute = (args: Record<string, unknown>) => {
    const result = extractSkillsTool.fn(stubCtx, args);
    return result.content as { skills: string[] };
  };

  it('extracts skills based on exact keywords', () => {
    const result = execute({
      job_description: 'We are looking for someone with experience in robotics and control systems.'
    });
    expect(result.skills).toContain('robotics');
    expect(result.skills).toContain('control_systems');
    expect(result.skills).toHaveLength(2);
  });

  it('handles aliases', () => {
    const result = execute({
      job_description: 'Must know ML, DSP, and FPGA development.'
    });
    expect(result.skills).toContain('machine_learning');
    expect(result.skills).toContain('digital_signal_processing');
    expect(result.skills).toContain('fpga_design');
  });

  it('is case insensitive', () => {
    const result = execute({
      job_description: 'Experience with VERILOG and IOT'
    });
    expect(result.skills).toContain('fpga_design');
    expect(result.skills).toContain('iot');
  });

  it('uses word boundaries to avoid partial matches', () => {
    const result = execute({
      job_description: 'A powerful tool for networking applications, not idioteque'
    });
    expect(result.skills).toContain('computer_networking');
    expect(result.skills).not.toContain('power_electronics');
    expect(result.skills).not.toContain('iot');
  });

  it('returns empty array when no skills match', () => {
    const result = execute({
      job_description: 'Looking for a good team player with strong communication skills.'
    });
    expect(result.skills).toHaveLength(0);
  });

  it('deduplicates skills from multiple aliases', () => {
    const result = execute({
      job_description: 'Knowledge of ML and artificial intelligence and machine learning'
    });
    expect(result.skills).toEqual(['machine_learning']);
  });
});

describe('extractSkills (pure function)', () => {
  it('returns an array of matched skill keys from plain text', () => {
    const skills = extractSkills('We need embedded systems and FPGA experience.');
    expect(skills).toContain('embedded_systems');
    expect(skills).toContain('fpga_design');
  });

  it('returns empty array for unrecognized text', () => {
    expect(extractSkills('great communication and teamwork')).toHaveLength(0);
  });

  it('is case insensitive', () => {
    expect(extractSkills('ROBOTICS AND DSP')).toContain('robotics');
    expect(extractSkills('ROBOTICS AND DSP')).toContain('digital_signal_processing');
  });

  it('deduplicates when multiple aliases map to the same key', () => {
    const skills = extractSkills('machine learning and ML and deep learning');
    expect(skills.filter(s => s === 'machine_learning')).toHaveLength(1);
  });
});
