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

// assimpjs (WASM assimp) ships no types; this is the part of its API the pipeline uses (DAE → glTF).
declare module 'assimpjs' {
  interface AssimpFile {
    GetPath(): string;
    GetContent(): Uint8Array;
  }
  interface AssimpResult {
    IsSuccess(): boolean;
    GetErrorCode(): string;
    FileCount(): number;
    GetFile(index: number): AssimpFile;
  }
  interface AssimpFileList {
    AddFile(path: string, content: Uint8Array): void;
  }
  interface Assimp {
    FileList: new () => AssimpFileList;
    ConvertFileList(files: AssimpFileList, format: 'gltf2' | 'glb2'): AssimpResult;
  }
  function assimpjs(): Promise<Assimp>;
  export default assimpjs;
}
