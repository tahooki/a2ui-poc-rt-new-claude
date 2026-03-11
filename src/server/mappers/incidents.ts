import type { Incident, IncidentEvent, IncidentEvidence } from '@/types/domain';

export type IncidentRecord = {
  id: string;
  title: string;
  description: string;
  service_id: string;
  environment: Incident['environment'];
  severity: Incident['severity'];
  status: Incident['status'];
  assignee_id: string | null;
  linked_deployment_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IncidentEventRecord = {
  id: string;
  incident_id: string;
  actor_id: string;
  action: string;
  detail: string;
  created_at: string;
};

export type IncidentEvidenceRecord = {
  id: string;
  incident_id: string;
  type: IncidentEvidence['type'];
  title: string;
  content: string;
  created_at: string;
};

export function mapIncidentRecord(record: IncidentRecord): Incident {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    serviceId: record.service_id,
    environment: record.environment,
    severity: record.severity,
    status: record.status,
    assigneeId: record.assignee_id,
    linkedDeploymentId: record.linked_deployment_id,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function mapIncidentEventRecord(record: IncidentEventRecord): IncidentEvent {
  return {
    id: record.id,
    incidentId: record.incident_id,
    actorId: record.actor_id,
    action: record.action,
    detail: record.detail,
    createdAt: record.created_at,
  };
}

export function mapIncidentEvidenceRecord(
  record: IncidentEvidenceRecord
): IncidentEvidence {
  return {
    id: record.id,
    incidentId: record.incident_id,
    type: record.type,
    title: record.title,
    content: record.content,
    createdAt: record.created_at,
  };
}
