/**
 * OSINT Nexus - Evidence Graph Generator (Phase 2 Refactor)
 * Creates multi-modal visual graph nodes based on independent entities and explicit relationships.
 */

import { EntityCandidate, Relationship, Evidence, EvidenceGraph, EvidenceGraphLink, EvidenceGraphNode, TargetInput } from '../models/types';

export class EvidenceGraphBuilder {

  public static build(
    target: TargetInput,
    entities: EntityCandidate[],
    relationships: Relationship[],
    evidences: Evidence[]
  ): EvidenceGraph {
    const nodes: EvidenceGraphNode[] = [];
    const links: EvidenceGraphLink[] = [];
    const nodeMap = new Set<string>();

    // 1. Root Target Node
    const targetNodeId = 'TARGET';
    nodes.push({
      id: targetNodeId,
      label: target.raw,
      type: 'target',
      group: 'target',
      confidence: 100,
      metadata: { classification: target.classification }
    });
    nodeMap.add(targetNodeId);

    // 2. Entity Nodes
    for (const entity of entities) {
      if (!nodeMap.has(entity.id)) {
        nodes.push({
          id: entity.id,
          label: `${entity.primaryType}: ${entity.label}`,
          type: 'entity',
          group: entity.primaryType.toLowerCase(),
          confidence: entity.confidence,
          metadata: { propertiesCount: entity.attributes.length, status: entity.status }
        });
        nodeMap.add(entity.id);
      }

      // Add attributes as leaf nodes
      for (const attr of entity.attributes) {
        const attrNodeId = `attr_${attr.type}_${attr.normalized.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        if (!nodeMap.has(attrNodeId)) {
          nodes.push({
            id: attrNodeId,
            label: `${attr.type.toUpperCase()}: ${attr.raw}`,
            type: 'evidence',
            group: 'property',
            confidence: attr.confidence
          });
          nodeMap.add(attrNodeId);

          links.push({
            source: entity.id,
            target: attrNodeId,
            relation: `HAS_${attr.type.toUpperCase()}`,
            weight: attr.confidence,
            evidenceIds: attr.evidenceIds
          });
        }
      }
    }

    // 3. Evidence / Platform Nodes
    for (const ev of evidences.slice(0, 30)) {
      const evNodeId = `ev_${ev.id}`;
      if (!nodeMap.has(evNodeId)) {
        nodes.push({
          id: evNodeId,
          label: `${ev.source} [${ev.status}]`,
          type: 'platform',
          group: ev.status.toLowerCase(),
          confidence: ev.confidence,
          metadata: { sourceUrl: ev.sourceUrl }
        });
        nodeMap.add(evNodeId);
      }
    }

    // Link Entities to Evidences
    for (const entity of entities) {
      for (const evId of entity.supportingEvidence) {
        if (nodeMap.has(`ev_${evId}`)) {
          links.push({
            source: entity.id,
            target: `ev_${evId}`,
            relation: 'SUPPORTED_BY',
            weight: entity.confidence,
            evidenceIds: [evId]
          });
        }
      }
    }

    // 4. Entity Relationships
    for (const rel of relationships) {
      if (nodeMap.has(rel.fromEntity) && nodeMap.has(rel.toEntity)) {
        links.push({
          source: rel.fromEntity,
          target: rel.toEntity,
          relation: rel.type,
          weight: rel.confidence,
          evidenceIds: rel.evidenceIds
        });
      }
    }

    return { nodes, links };
  }
}
