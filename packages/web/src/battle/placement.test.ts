import { describe, it, expect } from 'vitest';
import { screenToField, dropDecision, dragIntent } from './placement';
describe('one transform for drag and tap',()=>{
 const rect={left:100,top:50,width:180,height:320};
 it('maps both perspectives and the visible field edges',()=>{expect(screenToField(rect,140,330,0)).toEqual({x:4,y:4});expect(screenToField(rect,140,330,1)).toEqual({x:14,y:28});});
 it('ignores outside releases and letterbox gutters',()=>{expect(screenToField(rect,99,330,0)).toBeNull();expect(screenToField({...rect,width:300},110,100,0)).toBeNull();expect(screenToField({...rect,height:0},140,330,0)).toBeNull();});
 it('does not treat normal tap jitter as a drag',()=>{expect(dragIntent({x:10,y:10},{x:14,y:14})).toBe(false);expect(dragIntent({x:10,y:10},{x:10,y:18})).toBe(true);});
 it('snaps at the river without allowing enemy-side troops or invalid coordinates',()=>{expect(dropDecision(0,9,15)).toEqual({x:9,y:14.5});expect(dropDecision(1,9,17)).toEqual({x:9,y:17.5});expect(dropDecision(0,9,20)).toBeNull();expect(dropDecision(1,9,4)).toBeNull();expect(dropDecision(0,NaN,4)).toBeNull();});
});
