import { WebIO } from '@gltf-transform/core';
import { flatten, join, prune } from '@gltf-transform/functions';

const MAX_FILE_BYTES = 150 * 1024 * 1024;
const OPTIMIZE_AFTER_PRIMITIVES = 1600;
const OPTIMIZE_AFTER_MATERIALS = 500;

function inspectGlb(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    throw new Error('This is not a valid binary glTF file.');
  }
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > view.byteLength) throw new Error('The GLB file appears to be truncated.');
    if (type === 0x4e4f534a) {
      const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length)));
      const primitives = (json.meshes || []).reduce((sum, mesh) => sum + (mesh.primitives?.length || 0), 0);
      return { primitives, materials: json.materials?.length || 0, hasAnimation: Boolean(json.animations?.length), hasSkin: Boolean(json.skins?.length), json, jsonChunkOffset: offset, jsonChunkLength: length };
    }
    offset = start + length;
  }
  throw new Error('The GLB file has no readable scene data.');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter((key) => key !== 'name').sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function compactDuplicateMaterials(buffer, stats) {
  const json = stats.json;
  if (!Array.isArray(json.materials) || json.extensionsUsed?.includes('KHR_materials_variants')) return { buffer, materials: stats.materials };

  const seen = new Map();
  const remap = new Array(json.materials.length);
  const compacted = [];
  json.materials.forEach((material, index) => {
    const signature = JSON.stringify(stableValue(material));
    let mapped = seen.get(signature);
    if (mapped === undefined) {
      mapped = compacted.length;
      seen.set(signature, mapped);
      compacted.push(material);
    }
    remap[index] = mapped;
  });
  if (compacted.length === json.materials.length) return { buffer, materials: compacted.length };

  json.materials = compacted;
  for (const mesh of json.meshes || []) for (const primitive of mesh.primitives || []) {
    if (primitive.material !== undefined) primitive.material = remap[primitive.material];
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = (jsonBytes.byteLength + 3) & ~3;
  let otherChunksLength = 0;
  const view = new DataView(buffer);
  for (let offset = 12; offset + 8 <= buffer.byteLength;) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type !== 0x4e4f534a) otherChunksLength += 8 + length;
    offset += 8 + length;
  }

  const output = new ArrayBuffer(12 + 8 + paddedLength + otherChunksLength);
  const outputView = new DataView(output);
  outputView.setUint32(0, 0x46546c67, true);
  outputView.setUint32(4, 2, true);
  outputView.setUint32(8, output.byteLength, true);
  outputView.setUint32(12, paddedLength, true);
  outputView.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(output, 20, jsonBytes.byteLength).set(jsonBytes);
  new Uint8Array(output, 20 + jsonBytes.byteLength, paddedLength - jsonBytes.byteLength).fill(0x20);

  let target = 20 + paddedLength;
  for (let offset = 12; offset + 8 <= buffer.byteLength;) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunkSize = 8 + length;
    if (type !== 0x4e4f534a) {
      new Uint8Array(output, target, chunkSize).set(new Uint8Array(buffer, offset, chunkSize));
      target += chunkSize;
    }
    offset += chunkSize;
  }
  return { buffer: output, materials: compacted.length };
}

function postProgress(message) {
  self.postMessage({ type: 'progress', message });
}

self.onmessage = async ({ data }) => {
  try {
    const { buffer, extension } = data;
    if (buffer.byteLength > MAX_FILE_BYTES) {
      throw new Error('This model is larger than 150 MB. Please export a lighter preview from SketchUp.');
    }

    let glbBuffer = buffer;
    if (extension === 'skp') {
      postProgress('Reading SketchUp geometry…');
      const { SkpFile, toGLB } = await import('openskp');
      const scene = SkpFile.fromBuffer(buffer).buildScene();
      if (!scene.glbPrimitives?.length) throw new Error('No previewable geometry was found in this SketchUp model.');
      const converted = toGLB(scene, { textures: true });
      glbBuffer = converted.buffer.slice(converted.byteOffset, converted.byteOffset + converted.byteLength);
      if (glbBuffer.byteLength > MAX_FILE_BYTES) throw new Error('The converted SketchUp model is larger than 150 MB. Export a lighter preview.');
    }

    const fileStats = inspectGlb(glbBuffer);
    const originalMaterialCount = fileStats.materials;
    if (fileStats.hasAnimation || fileStats.hasSkin) {
      postProgress('Preparing animated model…');
      self.postMessage({ type: 'complete', buffer: glbBuffer, optimized: false, stats: fileStats }, [glbBuffer]);
      return;
    }

    if (fileStats.primitives < OPTIMIZE_AFTER_PRIMITIVES && fileStats.materials < OPTIMIZE_AFTER_MATERIALS) {
      postProgress('Preparing model…');
      self.postMessage({ type: 'complete', buffer: glbBuffer, optimized: false, stats: fileStats }, [glbBuffer]);
      return;
    }

    postProgress(`Combining ${fileStats.materials.toLocaleString()} materials and ${fileStats.primitives.toLocaleString()} mesh parts…`);
    const compacted = compactDuplicateMaterials(glbBuffer, fileStats);
    glbBuffer = compacted.buffer;
    fileStats.materials = compacted.materials;
    const io = new WebIO().setStrictResources(false);
    postProgress('Reading the compacted model…');
    const document = await io.readBinary(new Uint8Array(glbBuffer));
    const root = document.getRoot();
    postProgress('Joining nearby mesh parts…');
    await document.transform(
      flatten(),
      join({ keepNamed: false }),
      prune(),
    );
    const optimizedStats = {
      primitives: root.listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().length, 0),
      materials: root.listMaterials().length,
    };
    postProgress('Preparing the optimized preview…');
    const result = await io.writeBinary(document);
    const resultBuffer = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
    self.postMessage({ type: 'complete', buffer: resultBuffer, optimized: true, stats: { before: { primitives: fileStats.primitives, materials: originalMaterialCount }, after: optimizedStats } }, [resultBuffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The model could not be prepared for preview.' });
  }
};
