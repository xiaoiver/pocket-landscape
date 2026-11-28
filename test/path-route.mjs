import assert from 'node:assert/strict';
import {insideBed,measureRoute,nearestOnRoute,originalCurve,plantedRoute,readRoute,stoneOnRoute} from '../source/path-route.js';

assert.equal(readRoute(undefined),undefined);
assert.equal(readRoute([[0,0],[0,0]]),undefined);
assert.equal(readRoute([[0,0],[NaN,0]]),undefined);
assert.equal(readRoute(plantedRoute),plantedRoute);
const straight=measureRoute([[0,-1],[0,1]]);
const station=nearestOnRoute(straight,.1,0);
assert.ok(Math.abs(station.t-.5)<1e-8);
const [x,z]=stoneOnRoute(straight,station,.04);
assert.ok(Math.hypot(x-.1,z)<1e-8);

// A hand-drawn trail may double back or repeat a control point.
const bent=measureRoute([[0,1],[.7,.4],[.7,.4],[.3,-.7],[-.8,-.2],[-.2,.4]]);
for (const route of [originalCurve,bent]) {
  for (const s of route.segments) {
    assert.ok(Number.isFinite(s.tx) && Number.isFinite(s.tz));
    const pose=stoneOnRoute(route,{t:s.start/route.length,side:.22},.045);
    assert.ok(Math.hypot(...pose)<=1.27+1e-8);
  }
}
assert.ok(Math.abs(Math.hypot(...insideBed(3,4))-1.29)<1e-8);
