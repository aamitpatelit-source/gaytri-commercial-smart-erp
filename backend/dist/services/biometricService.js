"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BiometricService = void 0;
const db_1 = require("../config/db");
class BiometricService {
    /**
     * Calculates cosine similarity between two 128-dimensional vectors.
     */
    static calculateSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== 128 || vecB.length !== 128) {
            return 0.0;
        }
        let dotProduct = 0.0;
        let normA = 0.0;
        let normB = 0.0;
        for (let i = 0; i < 128; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0)
            return 0.0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    /**
     * Queries potential candidates for biometric matching.
     * Abstracts queries so pgvector or FAISS can be dropped in easily.
     */
    static async getMatchingCandidates(candidateId) {
        if (candidateId) {
            // 1:1 match candidates
            const result = await (0, db_1.query)(`SELECT id, employee_id, full_name, biometric_embedding, face_embedding, biometric_enrolled 
         FROM employees 
         WHERE (id::text = $1 OR employee_id = $1) AND is_active = TRUE`, [candidateId]);
            return result.rows;
        }
        else {
            // 1:N match candidates. In large-scale systems, this query will be modified
            // to use vector similarity search (e.g. pgvector `<=>` index operator) to return top K matches.
            const result = await (0, db_1.query)(`SELECT id, employee_id, full_name, biometric_embedding, face_embedding, biometric_enrolled 
         FROM employees 
         WHERE is_active = TRUE AND (biometric_enrolled = TRUE OR face_embedding IS NOT NULL)`);
            return result.rows;
        }
    }
}
exports.BiometricService = BiometricService;
