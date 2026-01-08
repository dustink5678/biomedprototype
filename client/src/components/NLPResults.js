/**
 * @file NLPResults.js
 * @description Modal component displaying comprehensive NLP analysis results.
 * 
 * @module components/NLPResults
 * @requires react
 * 
 * @connections
 * - Used by: Recording, Replay pages (when NLP analysis is complete)
 * 
 * @summary
 * Full-screen modal displaying NLP analysis data:
 * - Sentiment analysis with confidence score
 * - Topic classification with primary topic highlight
 * - Named entity recognition grid
 * - Part-of-speech analysis table
 * - Text statistics (words, characters, sentences)
 * Color-coded for visual clarity.
 */

import React from 'react';

const NLPResults = ({ results, onClose }) => {
    if (!results) return null;

    const { sentiment, entities, pos_counts, pos_percentages, topics, stats } = results;

    return (
        <div className="nlp-results-modal" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }}>
            <div className="nlp-results-content" style={{
                background: 'white',
                borderRadius: '8px',
                maxWidth: '800px',
                maxHeight: '80vh',
                overflow: 'auto',
                width: '100%',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}>
                <div className="nlp-results-header" style={{
                    padding: '20px',
                    borderBottom: '1px solid #e9ecef',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, color: '#333' }}>NLP Analysis Results</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            color: '#666'
                        }}
                    >
                        ×
                    </button>
                </div>

                <div className="nlp-results-body" style={{ padding: '20px' }}>
                    {/* Sentiment Analysis */}
                    <div className="nlp-section" style={{ marginBottom: '30px' }}>
                        <h3 style={{ color: '#495057', borderBottom: '2px solid #007bff', paddingBottom: '8px' }}>
                            Sentiment Analysis
                        </h3>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '15px',
                            marginTop: '15px'
                        }}>
                            <div style={{
                                padding: '12px 20px',
                                borderRadius: '6px',
                                backgroundColor: sentiment.label === 'POSITIVE' ? '#d4edda' : sentiment.label === 'NEGATIVE' ? '#f8d7da' : '#fff3cd',
                                border: `2px solid ${sentiment.label === 'POSITIVE' ? '#c3e6cb' : sentiment.label === 'NEGATIVE' ? '#f5c6cb' : '#ffeaa7'}`,
                                fontWeight: 'bold',
                                color: sentiment.label === 'POSITIVE' ? '#155724' : sentiment.label === 'NEGATIVE' ? '#721c24' : '#856404'
                            }}>
                                {sentiment.label}
                            </div>
                            <div style={{ fontSize: '14px', color: '#666' }}>
                                Confidence: {(sentiment.score * 100).toFixed(1)}%
                            </div>
                        </div>
                    </div>

                    {/* Topic Classification */}
                    <div className="nlp-section" style={{ marginBottom: '30px' }}>
                        <h3 style={{ color: '#495057', borderBottom: '2px solid #28a745', paddingBottom: '8px' }}>
                            Topic Classification
                        </h3>
                        <div style={{ marginTop: '15px' }}>
                            <div style={{
                                fontSize: '18px',
                                fontWeight: 'bold',
                                color: '#28a745',
                                marginBottom: '10px'
                            }}>
                                Primary Topic: {topics.primary}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {Object.entries(topics.scores).map(([topic, score]) => (
                                    <div key={topic} style={{
                                        padding: '6px 12px',
                                        borderRadius: '4px',
                                        backgroundColor: topic === topics.primary ? '#007bff' : '#f8f9fa',
                                        color: topic === topics.primary ? 'white' : '#333',
                                        fontSize: '12px',
                                        border: '1px solid #dee2e6'
                                    }}>
                                        {topic}: {(score * 100).toFixed(1)}%
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Named Entities */}
                    <div className="nlp-section" style={{ marginBottom: '30px' }}>
                        <h3 style={{ color: '#495057', borderBottom: '2px solid #dc3545', paddingBottom: '8px' }}>
                            Named Entities ({entities.length})
                        </h3>
                        {entities.length > 0 ? (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: '10px',
                                marginTop: '15px'
                            }}>
                                {entities.map((entity, index) => (
                                    <div key={index} style={{
                                        padding: '8px 12px',
                                        borderRadius: '4px',
                                        backgroundColor: '#f8f9fa',
                                        border: '1px solid #dee2e6',
                                        fontSize: '14px'
                                    }}>
                                        <div style={{ fontWeight: 'bold', color: '#dc3545' }}>
                                            {entity.text}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#666' }}>
                                            {entity.label} ({(entity.score * 100).toFixed(1)}%)
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ color: '#666', fontStyle: 'italic', marginTop: '15px' }}>
                                No named entities detected
                            </div>
                        )}
                    </div>

                    {/* Part-of-Speech Analysis */}
                    <div className="nlp-section" style={{ marginBottom: '30px' }}>
                        <h3 style={{ color: '#495057', borderBottom: '2px solid #6f42c1', paddingBottom: '8px' }}>
                            Part-of-Speech Analysis
                        </h3>
                        <div style={{ marginTop: '15px' }}>
                            <table style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                border: '1px solid #dee2e6'
                            }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                                        <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #dee2e6' }}>Part of Speech</th>
                                        <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>Count</th>
                                        <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>Percentage</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(pos_counts).map(([pos, count]) => (
                                        <tr key={pos}>
                                            <td style={{ padding: '8px', border: '1px solid #dee2e6', textTransform: 'capitalize' }}>
                                                {pos}
                                            </td>
                                            <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>
                                                {count}
                                            </td>
                                            <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>
                                                {pos_percentages[pos]}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Statistics */}
                    <div className="nlp-section">
                        <h3 style={{ color: '#495057', borderBottom: '2px solid #17a2b8', paddingBottom: '8px' }}>
                            Text Statistics
                        </h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                            gap: '15px',
                            marginTop: '15px'
                        }}>
                            <div style={{
                                padding: '12px',
                                borderRadius: '4px',
                                backgroundColor: '#f8f9fa',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#17a2b8' }}>
                                    {stats.words}
                                </div>
                                <div style={{ fontSize: '12px', color: '#666' }}>Words</div>
                            </div>
                            <div style={{
                                padding: '12px',
                                borderRadius: '4px',
                                backgroundColor: '#f8f9fa',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#17a2b8' }}>
                                    {stats.chars}
                                </div>
                                <div style={{ fontSize: '12px', color: '#666' }}>Characters</div>
                            </div>
                            <div style={{
                                padding: '12px',
                                borderRadius: '4px',
                                backgroundColor: '#f8f9fa',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#17a2b8' }}>
                                    {stats.sentences}
                                </div>
                                <div style={{ fontSize: '12px', color: '#666' }}>Sentences</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NLPResults;

