/**
 * GraphQL operation documents used by the browser client (and by tests).
 * They are plain strings so no build-time codegen is required.
 */

export const SCENARIOS = /* GraphQL */ `
  query Scenarios {
    scenarios {
      id
      kind
      title
      description
    }
  }
`;

const VEC3 = `{ x y z }`;
const BOUNDS = `{ center ${VEC3} size ${VEC3} }`;
const CONFIG = `{
  visionRange visionFovDegrees lastKnownSeconds cameraStatus smokeEnabled
  baseSwayAmplitude swayFrequencyHz settleSeconds captureSeconds
}`;

export const SCENARIO = /* GraphQL */ `
  query Scenario($id: ID!) {
    scenario(id: $id) {
      id
      kind
      title
      description
      seed
      defaultConfig ${CONFIG}
      initialScene {
        mapId
        roomMinX
        roomMaxX
        colliders { id bounds ${BOUNDS} blocksMovement blocksSight blocksShots visualRole isCover isVaultable }
        entities { id kind team label position ${VEC3} facingX stance moveMode script waypoints ${VEC3} holdSeconds }
        depthZones { id label bounds ${BOUNDS} }
        smokeBounds ${BOUNDS}
        captureBounds ${BOUNDS}
        cameras { id label team mount mountNormal ${VEC3} position ${VEC3} lookAt ${VEC3} fovDegrees range }
        deployableCameras
        loadout { primary sidearm }
        stationLabels { id label x }
      }
    }
  }
`;

export const SESSION = /* GraphQL */ `
  query Session($id: ID!) {
    session(id: $id) { id scenarioId seed revision config ${CONFIG} }
  }
`;

export const API_INFO = /* GraphQL */ `
  query ApiInfo { apiInfo { name version sessionCount sessionCap } }
`;

export const CREATE_SESSION = /* GraphQL */ `
  mutation CreateSession($scenarioId: ID!) {
    createSession(scenarioId: $scenarioId) { id scenarioId seed revision config ${CONFIG} }
  }
`;

export const UPDATE_CONFIG = /* GraphQL */ `
  mutation UpdateConfig($sessionId: ID!, $expectedRevision: Int!, $patch: DemoConfigPatch!) {
    updateConfig(sessionId: $sessionId, expectedRevision: $expectedRevision, patch: $patch) {
      id scenarioId seed revision config ${CONFIG}
    }
  }
`;

export const RESET_SESSION = /* GraphQL */ `
  mutation ResetSession($sessionId: ID!, $expectedRevision: Int!) {
    resetSession(sessionId: $sessionId, expectedRevision: $expectedRevision) {
      id scenarioId seed revision config ${CONFIG}
    }
  }
`;

/** Operation name extracted from a document (for the developer API panel). */
export function operationName(document: string): string {
  const m = /(query|mutation)\s+([A-Za-z0-9_]+)/.exec(document);
  return m?.[2] ?? 'anonymous';
}
