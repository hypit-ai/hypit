# @hypit/alibaba-video

Alibaba Video Generation Model Support for Hypit

## Overview

This package provides integration with Alibaba's video generation models, specifically the **Qwen Video Generation (Qwen VVG)** model. It enables AI-powered video generation with text prompts and optional reference images.

## Features

- **Text-to-Video Generation**: Generate videos from text prompts
- **Reference-Based Generation**: Use reference images to guide the generation style
- **Configurable Resolution**: Support for 480p, 720p, and 1080p output
- **Multiple Aspect Ratios**: Support for 1:1, 16:9, 9:16, 4:3, 3:4 formats
- **Variable Duration**: Generate videos with 5-10 second duration

## Supported Models

### Alibaba Qwen Video Generation (alibaba-qwen-vvg)

- **Input**: Text prompt (max 200 characters)
- **Resolution**: 480p, 720p, 1080p
- **Duration**: 5-10 seconds
- **Aspect Ratios**: 1:1, 16:9, 9:16, 4:3, 3:4
- **Optional Reference**: Image for style guidance

## Usage

### Basic Text-to-Video

```markup
<alibaba:TextVideo
  id="my-video"
  model="qwen-vvg"
  prompt={description}
  duration="6"
  resolution="720p"
  aspect-ratio="16:9"
/>
```

### Video Generation with Reference Image

```markup
<alibaba:ReferenceVideo
  id="styled-video"
  model="qwen-vvg"
  prompt={description}
  duration="8"
  resolution="1080p"
  aspect-ratio="9:16"
  reference-image={style.image}
/>
```

## Configuration

### Prompt
- Maximum 200 characters
- Should describe the desired video content clearly

### Duration
- Range: 5-10 seconds
- Must be a whole number

### Resolution
- `480p`: Lower quality, faster generation
- `720p`: Standard quality (default)
- `1080p`: High quality, longer generation time

### Aspect Ratio
- `16:9`: Landscape (default)
- `9:16`: Portrait/vertical
- `1:1`: Square
- `4:3`: Standard
- `3:4`: Vertical standard

## Architecture

The package follows Hypit's standard model integration pattern:

- **Generation Ports**: Defines input/output structure
- **Markup Surfaces**: Provides XML/markup interface for video generation
- **Fragment Builders**: Creates generation fragments with proper request sealing
- **Surface Decoders**: Converts markup into generation requests

## Dependencies

- `@hypit/artifact`: Artifact type definitions
- `@hypit/generation`: Generation request/port infrastructure
- `@hypit/model-kit`: Model module definition utilities
- `@hypit/markup`: Markup surface definitions
- `@hypit/elaborator`: Fragment building and activation context
- `@hypit/text`: Text type definitions
- `@hypit/protocol`: Core protocol definitions

## License

See LICENSE file in the repository root.
