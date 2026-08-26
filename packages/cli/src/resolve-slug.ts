import { basename, extname, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { isValidSlug } from './page/slug.js';

export class InvalidSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSlugError';
  }
}

function normalizeSlugCandidate(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

/**
 * --name があればそれを検証して返す。なければパスから slug 候補を生成する。
 */
export async function resolveSlug(inputPath: string, nameOption?: string): Promise<string> {
  if (nameOption !== undefined) {
    if (!isValidSlug(nameOption)) {
      throw new InvalidSlugError(`無効な slug です: ${nameOption}`);
    }
    return nameOption;
  }

  const absolutePath = resolve(inputPath);
  const entryStat = await stat(absolutePath);
  const base = entryStat.isDirectory()
    ? basename(absolutePath)
    : basename(absolutePath, extname(absolutePath));
  const slug = normalizeSlugCandidate(base);

  if (!isValidSlug(slug)) {
    throw new InvalidSlugError(
      `パス名から slug を生成できません: ${base}。--name で指定してください。`,
    );
  }

  return slug;
}
