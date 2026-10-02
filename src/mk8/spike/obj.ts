// Minimal OBJ reader for the MK-92 spike: positions, faces (fan-triangulated, negative indices
// allowed) and `usemtl`. Everything else (normals, UVs, groups, MTL) is ignored: collision only
// needs world positions and a material name per triangle.

export interface ObjTriangles {
  /** Material names in first-use order. */
  materials: string[];
  /** Per material (same order): its triangles' positions, 9 floats each, in file order. */
  positions: Float32Array[];
}

export function parseObj(text: string): ObjTriangles {
  const vertices: number[] = [];
  const byMaterial = new Map<string, number[]>();
  let current = byMaterial.get('') ?? [];
  let currentName = '';
  const vertex = (token: string): number => {
    const index = Number.parseInt(token, 10);
    return index < 0 ? vertices.length / 3 + index : index - 1;
  };
  const pushVertex = (out: number[], i: number) =>
    out.push(vertices[i * 3] ?? 0, vertices[i * 3 + 1] ?? 0, vertices[i * 3 + 2] ?? 0);

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const [, x = '0', y = '0', z = '0'] = line.split(/\s+/);
      vertices.push(Number.parseFloat(x), Number.parseFloat(y), Number.parseFloat(z));
    } else if (line.startsWith('usemtl')) {
      currentName = line.slice('usemtl'.length).trim();
      current = byMaterial.get(currentName) ?? [];
      byMaterial.set(currentName, current);
    } else if (line.startsWith('f ')) {
      if (!byMaterial.has(currentName)) byMaterial.set(currentName, current);
      const corners = line
        .split(/\s+/)
        .slice(1)
        .map((token) => vertex(token.split('/')[0] ?? ''));
      const [first] = corners;
      if (first === undefined) continue;
      for (let i = 1; i + 1 < corners.length; i++) {
        pushVertex(current, first);
        pushVertex(current, corners[i] ?? 0);
        pushVertex(current, corners[i + 1] ?? 0);
      }
    }
  }
  const used = [...byMaterial].filter(([, positions]) => positions.length > 0);
  return {
    materials: used.map(([name]) => name),
    positions: used.map(([, positions]) => new Float32Array(positions)),
  };
}
