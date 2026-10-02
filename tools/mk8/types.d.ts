// obj2gltf ships no types; this is the part of its API the pipeline uses.
declare module 'obj2gltf' {
  interface Obj2GltfOptions {
    binary?: boolean;
    secure?: boolean;
    checkTransparency?: boolean;
    inputUpAxis?: 'X' | 'Y' | 'Z';
    outputUpAxis?: 'X' | 'Y' | 'Z';
    logger?: (message: string) => void;
  }
  function obj2gltf(objPath: string, options: Obj2GltfOptions & { binary: true }): Promise<Buffer>;
  export default obj2gltf;
}
