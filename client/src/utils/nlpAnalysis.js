/**
 * @file nlpAnalysis.js
 * @description Client-side NLP analysis using JavaScript libraries (fallback/offline mode).
 * 
 * @module utils/nlpAnalysis
 * @requires compromise - Natural language processing library
 * @requires sentiment - Sentiment analysis library
 * 
 * @connections
 * - Used by: Replay page for client-side augmentation
 * - Alternative to: Cloud Function NLP (nlpService.js)
 * 
 * @summary
 * Client-side NLP analyzer class providing:
 * - Sentiment analysis using sentiment.js
 * - Named entity extraction (regex-based fallback)
 * - Part-of-speech tagging using compromise.js
 * - Topic classification (keyword-based)
 * - Flagged word detection (profanity, sensitive, medical, positive)
 * - Text statistics (word/char/sentence counts)
 * 
 * Used for offline analysis and augmenting Cloud Function results.
 * Exports singleton NLPAnalyzer instance.
 */

import compromise from 'compromise';
import sentiment from 'sentiment';

class NLPAnalyzer {
    constructor() {
        this.sentimentAnalyzer = null;
        this.nerPipeline = null;
        this.topicClassifier = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {

            // Initialize sentiment analysis
            this.sentimentAnalyzer = new sentiment();

            // Skip heavy ML models for now - use fallback methods

            this.isInitialized = true;
        } catch (error) {
            console.error('Error loading NLP models:', error);
            throw error;
        }
    }

    async analyzeText(text) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Clean the text (similar to contractions.fix in Python)
            const cleanText = this.cleanText(text);

            // Sentiment Analysis
            let sentiment = { label: 'NEUTRAL', score: 0.5 };
            try {
                const sentimentResult = this.sentimentAnalyzer.analyze(cleanText);
                sentiment = this.convertSentiment(sentimentResult);
            } catch (error) {
            }

            // Named Entity Recognition (fallback method)
            let entities = [];
            try {
                entities = this.extractEntitiesFallback(cleanText);
            } catch (error) {
            }

            // Part-of-Speech Tagging and Analysis
            let posAnalysis = { counts: {}, percentages: {} };
            try {
                posAnalysis = this.analyzePOS(cleanText);
            } catch (error) {
            }

            // Topic Classification
            let topics = { primary: 'general', scores: {} };
            try {
                topics = await this.classifyTopics(cleanText);
            } catch (error) {
            }

            // Flagged Words Detection
            let flaggedWords = [];
            try {
                flaggedWords = this.detectFlaggedWords(cleanText);
            } catch (error) {
            }

            // Statistics - more robust calculation
            const words = cleanText.trim().split(/\s+/).filter(w => w.length > 0);
            const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);

            const stats = {
                words: words.length,
                chars: cleanText.length,
                sentences: Math.max(sentences.length, 1) // At least 1 sentence if there's text
            };

            return {
                sentiment,
                entities,
                pos_counts: posAnalysis.counts,
                pos_percentages: posAnalysis.percentages,
                topics,
                flagged_words: flaggedWords,
                stats,
                success: true
            };

        } catch (error) {
            console.error('Error analyzing text:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    cleanText(text) {
        // Simple text cleaning - expand contractions and normalize
        return text
            .replace(/can't/g, 'cannot')
            .replace(/won't/g, 'will not')
            .replace(/n't/g, ' not')
            .replace(/'re/g, ' are')
            .replace(/'ve/g, ' have')
            .replace(/'ll/g, ' will')
            .replace(/'d/g, ' would')
            .replace(/'m/g, ' am')
            .replace(/'s/g, ' is')
            .trim();
    }

    convertSentiment(sentimentResult) {
        // Convert sentiment npm result to match Python Flair format
        const score = sentimentResult.score || 0;
        let label = 'NEUTRAL';
        let confidence = 0.5;

        // The sentiment package returns scores where:
        // - Positive scores indicate positive sentiment
        // - Negative scores indicate negative sentiment
        // - Magnitude indicates strength
        if (score > 0.1) {
            label = 'POSITIVE';
            confidence = Math.min(0.5 + Math.abs(score) * 0.5, 0.9);
        } else if (score < -0.1) {
            label = 'NEGATIVE';
            confidence = Math.min(0.5 + Math.abs(score) * 0.5, 0.9);
        }


        return {
            label,
            score: confidence
        };
    }

    extractEntitiesFallback(text) {
        // Simple fallback entity extraction using regex patterns
        const entities = [];

        // Common patterns for different entity types
        const patterns = {
            PERSON: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // Names like "John Smith"
            ORGANIZATION: /\b[A-Z][a-z]+ (Inc|Corp|LLC|Ltd|Company|University|Hospital)\b/g,
            LOCATION: /\b[A-Z][a-z]+ (Street|Avenue|Road|City|State|Country)\b/g,
            DATE: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g,
            TIME: /\b\d{1,2}:\d{2}\s*(AM|PM|am|pm)\b/g,
            EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            PHONE: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g
        };

        Object.entries(patterns).forEach(([type, pattern]) => {
            const matches = text.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    entities.push({
                        text: match,
                        label: type,
                        score: 0.8 // Default confidence
                    });
                });
            }
        });

        return entities.slice(0, 25); // Limit like Python version
    }

    analyzePOS(text) {
        try {
            const doc = compromise(text);
            const terms = doc.terms();

            // Simplified and more reliable POS analysis using compromise.js
            const counts = {
                // Nouns
                'NN': doc.match('#Noun').not('#Plural').not('#ProperNoun').length,
                'NNS': doc.match('#Noun #Plural').not('#ProperNoun').length,
                'NNP': doc.match('#ProperNoun').not('#Plural').length,
                'NNPS': doc.match('#ProperNoun #Plural').length,

                // Verbs
                'VB': doc.match('#Verb').not('#PastTense').not('#Gerund').not('#PastParticiple').not('#Present').length,
                'VBD': doc.match('#Verb #PastTense').length,
                'VBG': doc.match('#Verb #Gerund').length,
                'VBN': doc.match('#Verb #PastParticiple').length,
                'VBP': doc.match('#Verb #Present').not('#ThirdPerson').length,
                'VBZ': doc.match('#Verb #Present #ThirdPerson').length,

                // Adjectives
                'JJ': doc.match('#Adjective').not('#Comparative').not('#Superlative').length,
                'JJR': doc.match('#Adjective #Comparative').length,
                'JJS': doc.match('#Adjective #Superlative').length,

                // Adverbs
                'RB': doc.match('#Adverb').not('#Comparative').not('#Superlative').length,
                'RBR': doc.match('#Adverb #Comparative').length,
                'RBS': doc.match('#Adverb #Superlative').length,

                // Pronouns
                'PRP': doc.match('#Pronoun').not('#Possessive').length,
                'PRP$': doc.match('#Pronoun #Possessive').length,

                // Prepositions and Conjunctions
                'IN': doc.match('#Preposition').length,
                'CC': doc.match('#Conjunction').length,

                // Determiners
                'DT': doc.match('#Determiner').length,

                // Modals and other
                'MD': doc.match('#Modal').length,
                'CD': doc.match('#Value').length,
                'UH': doc.match('#Expression').length
            };

            // Calculate total tagged words
            const totalTagged = Object.values(counts).reduce((sum, count) => sum + count, 0);
            const totalWords = terms.length;

            // Use total tagged words for percentages, fallback to total words
            const denominator = totalTagged > 0 ? totalTagged : totalWords;

            const percentages = {};
            Object.keys(counts).forEach(key => {
                percentages[key] = denominator > 0 ? ((counts[key] / denominator) * 100).toFixed(1) + '%' : '0.0%';
            });

            // Ensure we have some basic POS counts even if compromise fails
            if (totalTagged === 0 && totalWords > 0) {
                // Simple fallback based on word patterns
                const words = text.toLowerCase().split(/\s+/);
                counts['NN'] = words.filter(w => !w.match(/^(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|can|could|should|may|might)$/)).length;
                counts['VB'] = words.filter(w => w.match(/(ed|ing)$/) || w.match(/^(is|are|was|were|be|have|has|had|do|does|did|will|would|can|could|should|may|might)$/)).length;
                counts['JJ'] = words.filter(w => w.match(/(ful|ous|able|ible|ic|ish|ive|less|ous|some)$/)).length;
            }

            return { counts, percentages };
        } catch (error) {
            return { counts: {}, percentages: {} };
        }
    }

    async classifyTopics(text) {
        // Always use fallback topic classification
        return this.fallbackTopicClassification(text);
    }

    fallbackTopicClassification(text) {
        const lowerText = text.toLowerCase();
        const topicKeywords = {
            politics: ['government', 'election', 'policy', 'president', 'law', 'political', 'vote'],
            finance: ['money', 'bank', 'investment', 'stock', 'economy', 'financial', 'business'],
            technology: ['computer', 'software', 'internet', 'digital', 'ai', 'tech', 'device'],
            health: ['medical', 'doctor', 'patient', 'health', 'treatment', 'disease', 'medicine'],
            sports: ['game', 'team', 'player', 'sport', 'athlete', 'competition', 'coach'],
            education: ['school', 'student', 'teacher', 'learn', 'class', 'education', 'university']
        };

        const scores = {};
        let maxScore = 0;
        let primaryTopic = 'general';

        Object.entries(topicKeywords).forEach(([topic, keywords]) => {
            let score = 0;
            keywords.forEach(keyword => {
                const count = (lowerText.match(new RegExp(keyword, 'g')) || []).length;
                score += count;
            });
            scores[topic] = score;
            if (score > maxScore) {
                maxScore = score;
                primaryTopic = topic;
            }
        });

        // Normalize scores
        const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
        if (total > 0) {
            Object.keys(scores).forEach(topic => {
                scores[topic] = scores[topic] / total;
            });
        } else {
            // Default equal distribution
            Object.keys(scores).forEach(topic => {
                scores[topic] = 1 / Object.keys(scores).length;
            });
        }

        return {
            primary: primaryTopic,
            scores
        };
    }

    detectFlaggedWords(text) {
        const lowerText = text.toLowerCase();
        const words = lowerText.split(/\s+/);
        const wordCount = {};

        // Count word frequencies
        words.forEach(word => {
            const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
            if (cleanWord.length > 2) { // Ignore very short words
                wordCount[cleanWord] = (wordCount[cleanWord] || 0) + 1;
            }
        });


        // Define flagged word categories
        const flaggedCategories = {
            profanity: [
                'damn', 'hell', 'shit', 'fuck', 'bitch', 'asshole', 'bastard', 'crap',
                'piss', 'dick', 'cock', 'pussy', 'tits', 'ass', 'cum', 'jerk'
            ],
            sensitive: [
                'kill', 'death', 'die', 'dead', 'suicide', 'abuse', 'rape', 'violence',
                'hate', 'racist', 'sexist', 'discrimination', 'harassment', 'bullying'
            ],
            urgency: [
                'emergency', 'urgent', 'crisis', 'critical', 'immediate', 'asap',
                'priority', 'important', 'attention', 'warning', 'alert', 'help',
                'problem', 'issue', 'trouble', 'worried', 'concerned', 'serious'
            ],
            medical: [
                'pain', 'hurt', 'injury', 'illness', 'disease', 'sick', 'hospital',
                'doctor', 'medication', 'treatment', 'symptoms', 'diagnosis', 'health',
                'medicine', 'therapy', 'appointment', 'checkup', 'condition'
            ],
            positive: [
                'happy', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
                'awesome', 'brilliant', 'perfect', 'love', 'excited', 'thrilled',
                'delighted', 'pleased', 'satisfied', 'joy', 'cheerful', 'optimistic',
                'hopeful', 'grateful', 'thankful', 'blessed', 'proud', 'confident',
                'successful', 'achieved', 'accomplished', 'victory', 'win', 'celebrate',
                'good', 'nice', 'better', 'best', 'well', 'fine', 'okay', 'yes',
                'right', 'correct', 'true', 'sure', 'absolutely', 'definitely'
            ]
        };

        const flaggedWords = [];

        // Check for profanity and sensitive words
        Object.entries(flaggedCategories).forEach(([category, wordList]) => {
            wordList.forEach(flaggedWord => {
                const flaggedWordLower = flaggedWord.toLowerCase();
                if (wordCount[flaggedWordLower]) {
                    flaggedWords.push({
                        word: flaggedWordLower,
                        category: category,
                        frequency: wordCount[flaggedWordLower],
                        severity: category === 'profanity' ? 'high' : category === 'sensitive' ? 'high' : category === 'positive' ? 'low' : 'medium'
                    });
                }
            });
        });

        // Special check for "happy" word
        if (wordCount['happy']) {
        }

        if (flaggedWords.length > 0) {
        }

        // Check for frequently repeated words (potential emphasis or issues)
        const totalWords = Object.values(wordCount).reduce((sum, count) => sum + count, 0);
        Object.entries(wordCount).forEach(([word, count]) => {
            const frequency = count / totalWords;
            if (frequency > 0.05 && count > 3) { // More than 5% of text and repeated more than 3 times
                if (!flaggedWords.some(fw => fw.word === word)) {
                    flaggedWords.push({
                        word: word,
                        category: 'repetitive',
                        frequency: count,
                        severity: 'low'
                    });
                }
            }
        });

        // Remove duplicates and sort by severity
        const uniqueFlaggedWords = flaggedWords.filter((word, index, self) =>
            index === self.findIndex(w => w.word === word.word)
        );

        // For testing/demo purposes, add some common positive words if none found
        if (uniqueFlaggedWords.length === 0) {
            // Check for common positive conversational words
            const commonPositiveWords = ['good', 'well', 'yes', 'right', 'okay', 'fine', 'nice', 'great', 'happy'];
            commonPositiveWords.forEach(word => {
                if (wordCount[word]) {
                    uniqueFlaggedWords.push({
                        word: word,
                        category: 'positive',
                        frequency: wordCount[word],
                        severity: 'low'
                    });
                }
            });
        }


        return uniqueFlaggedWords.sort((a, b) => {
            const severityOrder = { high: 3, medium: 2, low: 1 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
    }
}

// Singleton instance
const nlpAnalyzer = new NLPAnalyzer();

export default nlpAnalyzer;
