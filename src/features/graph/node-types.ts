import type { NodeTypes } from '@xyflow/react';

import { CredentialNode } from './nodes/CredentialNode';
import { DeploymentNode } from './nodes/DeploymentNode';
import { IssuerNode } from './nodes/IssuerNode';
import { ProjectNode } from './nodes/ProjectNode';

/**
 * Module-scope constant — do NOT inline this object in JSX.
 * Inlining causes React Flow to re-create the map on every render,
 * which triggers a full node remount loop.
 */
export const nodeTypes: NodeTypes = {
  issuer: IssuerNode,
  credential: CredentialNode,
  project: ProjectNode,
  deployment: DeploymentNode,
};
