interface DebMetadata {
  Package: string;
  Version: string;
  Architecture: string;
  Maintainer?: string;
  Description?: string;
  InstalledSize?: string;
  Depends?: string;
  Section?: string;
  Priority?: string;
  Homepage?: string;
}

export async function parseDebPackage(data: Uint8Array, filename: string): Promise<DebMetadata> {
  // .deb files are ar archives containing:
  // - debian-binary (version)
  // - control.tar.gz (metadata)
  // - data.tar.gz/xz (actual files)
  
  // Check ar magic number
  const magic = new TextDecoder().decode(data.slice(0, 8));
  if (magic !== '!<arch>\n') {
    throw new Error('Invalid .deb file: not an ar archive');
  }

  // Parse ar archive to find control.tar.gz
  let offset = 8;
  let controlData: Uint8Array | null = null;

  while (offset < data.length) {
    // Read ar header (60 bytes)
    const header = new TextDecoder().decode(data.slice(offset, offset + 60));
    offset += 60;

    // Parse header fields
    const name = header.slice(0, 16).trim();
    const size = parseInt(header.slice(48, 58).trim());

    if (name.startsWith('control.tar')) {
      controlData = data.slice(offset, offset + size);
      break;
    }

    // Skip to next file (align to 2-byte boundary)
    offset += size;
    if (offset % 2 === 1) offset++;
  }

  if (!controlData) {
    // If we can't parse the .deb file, extract basic info from filename
    return extractFromFilename(filename);
  }

  // Parse control.tar.gz to get control file
  const controlContent = await extractControlFile(controlData);
  if (!controlContent) {
    return extractFromFilename(filename);
  }

  // Parse control file
  return parseControlFile(controlContent);
}

function extractFromFilename(filename: string): DebMetadata {
  // Try to extract package_version_architecture.deb pattern
  const match = filename.match(/^(.+?)_(.+?)_(.+?)\.deb$/);
  if (match) {
    return {
      Package: match[1],
      Version: match[2],
      Architecture: match[3],
    };
  }

  // Fallback
  const name = filename.replace('.deb', '');
  return {
    Package: name,
    Version: '1.0.0',
    Architecture: 'amd64',
  };
}

async function extractControlFile(tarGzData: Uint8Array): Promise<string | null> {
  try {
    // For simplicity, we'll look for the control file pattern in the decompressed data
    // In production, you'd use a proper tar.gz parser
    
    // Try to decompress gzip
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(tarGzData);
    writer.close();

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const decompressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }

    // Look for control file content in tar
    const text = new TextDecoder().decode(decompressed);
    const controlMatch = text.match(/Package: .+[\s\S]+?(?=\0|$)/);
    
    if (controlMatch) {
      return controlMatch[0];
    }
  } catch (error) {
    console.error('Error extracting control file:', error);
  }

  return null;
}

function parseControlFile(content: string): DebMetadata {
  const metadata: DebMetadata = {
    Package: '',
    Version: '',
    Architecture: 'amd64',
  };

  const lines = content.split('\n');
  let currentField = '';
  let currentValue = '';

  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      // Continuation of previous field
      currentValue += '\n' + line.trim();
    } else {
      // Save previous field if exists
      if (currentField && currentValue) {
        (metadata as any)[currentField] = currentValue;
      }

      // Parse new field
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        currentField = line.slice(0, colonIndex);
        currentValue = line.slice(colonIndex + 1).trim();
      }
    }
  }

  // Save last field
  if (currentField && currentValue) {
    (metadata as any)[currentField] = currentValue;
  }

  return metadata;
}