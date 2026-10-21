/**
 * Executable GraphQL schema. Isomorphic: no Node-only imports, so the exact
 * same schema + resolvers run inside GraphQL Yoga (server/index.ts) and inside
 * the browser's clearly labelled in-process fallback (src/graphql/inprocess.ts).
 */
import { makeExecutableSchema } from '@graphql-tools/schema';
import { createResolvers } from './resolvers.ts';
import type { SessionStore } from './store.ts';

export const typeDefs = /* GraphQL */ `
  """
  Units: metres, seconds, degrees, cycles per second.
  Axes: X = screen left/right, Y = up, Z = depth (+Z toward the camera).
  """
  enum ScenarioKind {
    HIDDEN_BATTLEFIELD
    EXPOSURE_LADDER
    CAMERA_INTEL
    LOST_CONTACT
    SMOKE_SOUND
    DEPTH_SHOT
    CONTROL_POINT
  }

  enum EntityKind { PLAYER ENEMY DROPPED_GEAR CAMERA }
  enum Team { FRIENDLY OPPOSING NEUTRAL }
  enum ScriptKind { STATIC PATROL LOST_CONTACT_ROUTE OBJECTIVE_CONTEST }
  enum CameraStatus { ONLINE OFFLINE JAMMED DESTROYED }
  enum Stance { STANDING CROUCHED }
  enum MoveMode { WALK COMBAT SPRINT }

  type Vec3 { x: Float!, y: Float!, z: Float! }
  type Bounds { center: Vec3!, size: Vec3! }

  type ColliderSeed {
    id: ID!
    bounds: Bounds!
    blocksMovement: Boolean!
    blocksSight: Boolean!
    blocksShots: Boolean!
    visualRole: String!
    isCover: Boolean!
  }

  type EntitySeed {
    id: ID!
    kind: EntityKind!
    team: Team!
    label: String!
    position: Vec3!
    "Always -1 or +1."
    facingX: Int!
    stance: Stance!
    moveMode: MoveMode!
    script: ScriptKind!
    waypoints: [Vec3!]!
    holdSeconds: Float!
  }

  type DepthZone { id: ID!, label: String!, bounds: Bounds! }

  type ReconCameraSeed {
    id: ID!
    label: String!
    position: Vec3!
    lookAt: Vec3!
    fovDegrees: Float!
    range: Float!
  }

  type StationLabel { id: ID!, label: String!, x: Float! }

  type SceneSeed {
    mapId: ID!
    colliders: [ColliderSeed!]!
    entities: [EntitySeed!]!
    depthZones: [DepthZone!]!
    smokeBounds: Bounds!
    captureBounds: Bounds!
    recon: ReconCameraSeed!
    roomMinX: Float!
    roomMaxX: Float!
    stationLabels: [StationLabel!]!
  }

  type DemoConfig {
    visionRange: Float!
    visionFovDegrees: Float!
    lastKnownSeconds: Float!
    cameraStatus: CameraStatus!
    smokeEnabled: Boolean!
    baseSwayAmplitude: Float!
    swayFrequencyHz: Float!
    settleSeconds: Float!
    captureSeconds: Float!
  }

  "Omitted field = unchanged. Explicit null is rejected (NULL_PATCH_FIELD)."
  input DemoConfigPatch {
    visionRange: Float
    visionFovDegrees: Float
    lastKnownSeconds: Float
    cameraStatus: CameraStatus
    smokeEnabled: Boolean
    baseSwayAmplitude: Float
    swayFrequencyHz: Float
    settleSeconds: Float
    captureSeconds: Float
  }

  type Scenario {
    id: ID!
    kind: ScenarioKind!
    title: String!
    description: String!
    seed: Int!
    initialScene: SceneSeed!
    defaultConfig: DemoConfig!
  }

  type DemoSession {
    id: ID!
    scenarioId: ID!
    seed: Int!
    revision: Int!
    config: DemoConfig!
  }

  type ApiInfo {
    name: String!
    version: String!
    sessionCount: Int!
    sessionCap: Int!
  }

  type Query {
    apiInfo: ApiInfo!
    scenarios: [Scenario!]!
    scenario(id: ID!): Scenario
    session(id: ID!): DemoSession
  }

  type Mutation {
    createSession(scenarioId: ID!): DemoSession!
    updateConfig(sessionId: ID!, expectedRevision: Int!, patch: DemoConfigPatch!): DemoSession!
    resetSession(sessionId: ID!, expectedRevision: Int!): DemoSession!
  }
`;

export function buildSchema(store: SessionStore) {
  return makeExecutableSchema({ typeDefs, resolvers: createResolvers(store) });
}
