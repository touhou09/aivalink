"""
Tests for the Embedding Service

These tests verify the chunking and embedding logic.
Note: Actual embedding model loading can be slow, so we test chunking separately.
"""

import pytest
from unittest.mock import patch, MagicMock

from app.services.embedding import EmbeddingService, get_embedding_service


class TestEmbeddingService:
    """Test cases for EmbeddingService"""

    def test_chunk_markdown_simple(self):
        """Test basic markdown chunking"""
        service = EmbeddingService()

        content = """# Heading 1
This is some content under heading 1.

## Heading 2
This is content under heading 2.
"""
        chunks = service.chunk_markdown(content)

        assert len(chunks) == 2
        assert chunks[0]["metadata"]["heading"] == "Heading 1"
        assert chunks[1]["metadata"]["heading"] == "Heading 2"
        assert "This is some content" in chunks[0]["content"]
        assert chunks[0]["chunk_index"] == 0
        assert chunks[1]["chunk_index"] == 1

    def test_chunk_markdown_no_headings(self):
        """Test chunking content without headings"""
        service = EmbeddingService()

        content = """This is a paragraph without any headings.
It has multiple lines.
And should be treated as a single chunk."""

        chunks = service.chunk_markdown(content)

        assert len(chunks) == 1
        assert chunks[0]["metadata"]["heading"] is None
        assert "This is a paragraph" in chunks[0]["content"]

    def test_chunk_markdown_large_content(self):
        """Test that large content is split into smaller chunks"""
        service = EmbeddingService()
        service.MAX_CHUNK_SIZE = 100  # Override for testing

        content = """# Large Section
This is a very long paragraph that should be split into multiple chunks because it exceeds the maximum chunk size. We want to make sure the splitting logic works correctly and maintains some overlap between chunks for context continuity."""

        chunks = service.chunk_markdown(content)

        assert len(chunks) > 1
        # First chunk should have the heading
        assert chunks[0]["metadata"]["heading"] == "Large Section"
        # Subsequent chunks should be marked as continuations
        for chunk in chunks[1:]:
            assert chunk["metadata"].get("is_continuation", False) is True

    def test_compute_hash(self):
        """Test content hashing for deduplication"""
        hash1 = EmbeddingService.compute_hash("Hello World")
        hash2 = EmbeddingService.compute_hash("Hello World")
        hash3 = EmbeddingService.compute_hash("Different Content")

        assert hash1 == hash2  # Same content = same hash
        assert hash1 != hash3  # Different content = different hash
        assert len(hash1) == 64  # SHA256 produces 64 hex chars

    def test_get_embedding_service_singleton(self):
        """Test that get_embedding_service returns a singleton"""
        service1 = get_embedding_service()
        service2 = get_embedding_service()

        assert service1 is service2

    @patch.object(EmbeddingService, 'model', new_callable=lambda: MagicMock())
    def test_embed_calls_model(self):
        """Test that embed calls the model's encode method"""
        service = EmbeddingService()

        # Mock the model
        mock_embedding = MagicMock()
        mock_embedding.tolist.return_value = [0.1] * 384
        service._model = MagicMock()
        service._model.encode.return_value = mock_embedding

        result = service.embed("test text")

        service._model.encode.assert_called_once_with("test text", convert_to_numpy=True)
        assert len(result) == 384

    @patch.object(EmbeddingService, 'model', new_callable=lambda: MagicMock())
    def test_embed_batch(self):
        """Test batch embedding"""
        service = EmbeddingService()

        # Mock the model
        import numpy as np
        mock_embeddings = np.random.rand(3, 384)
        service._model = MagicMock()
        service._model.encode.return_value = mock_embeddings

        texts = ["text1", "text2", "text3"]
        result = service.embed_batch(texts)

        service._model.encode.assert_called_once_with(texts, convert_to_numpy=True)
        assert len(result) == 3
        assert len(result[0]) == 384

    def test_chunk_empty_content(self):
        """Test chunking empty content"""
        service = EmbeddingService()
        chunks = service.chunk_markdown("")

        assert len(chunks) == 0

    def test_chunk_markdown_with_code_blocks(self):
        """Test chunking markdown with code blocks"""
        service = EmbeddingService()

        content = """# Code Example
Here's some Python code:

```python
def hello():
    print("Hello World")
```

And that's how you do it."""

        chunks = service.chunk_markdown(content)

        assert len(chunks) >= 1
        # Code should be included in the chunk
        assert "def hello()" in chunks[0]["content"] or "Hello World" in chunks[0]["content"]
