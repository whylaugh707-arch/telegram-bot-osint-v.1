/**
 * OSINT Nexus - Evidence Graph Generator
 * Creates multi-modal visual graph nodes and relationships with full provenance traceability.
 */

import { Entity, EntityRelationship, Evidence, EvidenceGraph, EvidenceGraphLink, EvidenceGraphNode, TargetInput } from '../models/types';

export class EvidenceGraphBuilder {

  public static build(
    target: TargetInput,
    entities: Entity[],
    relationships: EntityRelationship[],
    evidences: Evidence[]
  ): EvidenceGraph {
    const nodes: EvidenceGraphNode[] = [];
    const links: EvidenceGraphLink[] = [];
    const nodeMap = new Set<string>();

    // 1. Root Target Node
    const targetNodeId = `node_target_${target.normalized}`;
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
          confidence: entity.confidence.score,
          metadata: { propertiesCount: entity.properties.length }
        });
        nodeMap.add(entity.id);

        links.push({
          source: targetNodeId,
          target: entity.id,
          relation: 'RESOLVED_AS',
          weight: 90
        });
      }

      // Add properties as leaf nodes for clear visualization
      for (const prop of entity.properties) {
        const propNodeId = `prop_${prop.type}_${prop.normalizedValue.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        if (!nodeMap.has(propNodeId)) {
          nodes.push({
            id: propNodeId,
            label: `${prop.type.toUpperCase()}: ${prop.value}`,
            type: 'evidence',
            group: 'property',
            confidence: prop.confidence
          });
          nodeMap.add(propNodeId);

          links.push({
            source: entity.id,
            target: propNodeId,
            relation: `HAS_${prop.type.toUpperCase()}`,
            weight: prop.confidence,
            evidenceIds: prop.evidenceIds
          });
        }
      }
    }

    // 3. Evidence / Platform Nodes
    for (const ev of evidences.slice(0, 30)) { // Cap to avoid overwhelming graph visualizer
      const evNodeId = `ev_${ev.id}`;
      if (!nodeMap.has(evNodeId)) {
        nodes.push({
          id: evNodeId,
          label: `${ev.provenance.source} [${ev.tier}]`,
          type: 'platform',
          group: ev.tier.toLowerCase(),
          confidence: ev.confidenceScore,
          metadata: { sourceUrl: ev.provenance.sourceUrl, verified: ev.verified }
        });
        nodeMap.add(evNodeId);

        links.push({
          source: targetNodeId,
          target: evNodeId,
          relation: ev.verified ? 'VERIFIED_ON' : 'OBSERVED_IN',
          weight: ev.confidenceScore
        });
      }
    }

    // 4. Entity Relationships
    for (const rel of relationships) {
      links.push({
        source: rel.sourceEntityId,
        target: rel.targetEntityId,
        relation: rel.relation,
        weight: rel.confidence,
        evidenceIds: rel.evidenceIds
      });
    }

    return { nodes, links };
  }
}
