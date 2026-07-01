import { query } from '../config/db';

const EMBEDDING_DIMENSION = 128;

export class BiometricService {
  /**
   * Validates and L2-normalizes a 128-dimensional embedding vector.
   */
  static normalizeEmbedding(embedding: unknown): number[] {
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error('A 128-dimensional face embedding array is required.');
    }

    const normalized: number[] = [];
    let sumSq = 0.0;

    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      const value = Number(embedding[i]);
      if (!Number.isFinite(value)) {
        throw new Error('Embedding contains NaN or infinite values.');
      }

      normalized.push(value);
      sumSq += value * value;
    }

    const magnitude = Math.sqrt(sumSq);
    if (magnitude <= 0) {
      throw new Error('Embedding magnitude must be greater than zero.');
    }

    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      normalized[i] = normalized[i] / magnitude;
    }

    return normalized;
  }

  /**
   * Calculates cosine similarity between two 128-dimensional normalized vectors.
   */
  static calculateSimilarity(vecA: number[], vecB: number[]): number {
    try {
      const normalizedA = this.normalizeEmbedding(vecA);
      const normalizedB = this.normalizeEmbedding(vecB);

      let dotProduct = 0.0;
      for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
        dotProduct += normalizedA[i] * normalizedB[i];
      }

      return Math.max(-1.0, Math.min(1.0, dotProduct));
    } catch {
      return 0.0;
    }
  }

  /**
   * Queries potential candidates for biometric matching.
   */
  static async getMatchingCandidates(candidateId?: string): Promise<any[]> {
    if (candidateId) {
      const result = await query(
        `SELECT id, employee_id, full_name, biometric_embedding, biometric_enrolled 
         FROM employees 
         WHERE (id::text = $1 OR employee_id = $1) AND is_active = TRUE`,
        [candidateId]
      );
      return result.rows;
    } else {
      const result = await query(
        `SELECT id, employee_id, full_name, biometric_embedding, biometric_enrolled 
         FROM employees 
         WHERE is_active = TRUE
           AND biometric_enrolled = TRUE
           AND biometric_embedding IS NOT NULL`
      );
      return result.rows;
    }
  }
}
