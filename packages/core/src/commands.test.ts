import { describe, expect, it } from 'vitest';
import { History } from './commands';
import { createEmptyModel, migrateModel } from './model';

describe('History', () => {
  const setup = () => {
    const model = createEmptyModel('Test', 'MY');
    return { history: new History(model), levelId: model.levels[0]!.id };
  };

  it('undoes and redoes commands', () => {
    const { history, levelId } = setup();
    history.dispatch({ type: 'wall/add', levelId, wall: { id: 'w1', a: [0, 0], b: [1000, 0], thickness: 150 } });
    expect(history.present.levels[0]!.walls).toHaveLength(1);
    history.undo();
    expect(history.present.levels[0]!.walls).toHaveLength(0);
    history.redo();
    expect(history.present.levels[0]!.walls).toHaveLength(1);
  });

  it('collapses a drag into one undo step', () => {
    const { history, levelId } = setup();
    history.dispatch({
      type: 'item/add',
      levelId,
      item: { id: 'i', catalogId: 'sofa-3', position: [0, 0], elevation: 0, rotation: 0 },
    });
    for (let x = 1; x <= 10; x++) {
      history.dispatch({ type: 'item/update', levelId, id: 'i', patch: { position: [x * 100, 0] } }, { mergeKey: 'drag' });
    }
    history.seal();
    expect(history.present.levels[0]!.items[0]!.position).toEqual([1000, 0]);
    history.undo();
    expect(history.present.levels[0]!.items[0]!.position).toEqual([0, 0]);
  });

  it('moves shared wall corners together', () => {
    const { history, levelId } = setup();
    history.dispatch({
      type: 'batch',
      commands: [
        { type: 'wall/add', levelId, wall: { id: 'a', a: [0, 0], b: [1000, 0], thickness: 150 } },
        { type: 'wall/add', levelId, wall: { id: 'b', a: [1000, 0], b: [1000, 1000], thickness: 150 } },
      ],
    });
    history.dispatch({ type: 'vertex/move', levelId, from: [1000, 0], to: [1200, 0] });
    const [a, b] = history.present.levels[0]!.walls;
    expect(a!.b).toEqual([1200, 0]);
    expect(b!.a).toEqual([1200, 0]);
  });

  it('deleting a wall removes its openings', () => {
    const { history, levelId } = setup();
    history.dispatch({ type: 'wall/add', levelId, wall: { id: 'w', a: [0, 0], b: [3000, 0], thickness: 150 } });
    history.dispatch({
      type: 'opening/add',
      levelId,
      opening: { id: 'o', wallId: 'w', kind: 'door', offset: 1500, width: 900, height: 2100, sill: 0 },
    });
    history.dispatch({ type: 'wall/delete', levelId, id: 'w' });
    expect(history.present.levels[0]!.openings).toHaveLength(0);
  });
});

describe('migrateModel', () => {
  it('validates and returns a current model', () => {
    const model = createEmptyModel('X', 'SG');
    expect(migrateModel(JSON.parse(JSON.stringify(model)))).toEqual(model);
  });

  it('rejects invalid data', () => {
    expect(() => migrateModel({ schemaVersion: 1, name: 'bad' })).toThrow();
  });
});
