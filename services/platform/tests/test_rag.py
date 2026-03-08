"""
Tests for the RAG Service

Note: Full integration tests require PostgreSQL with pgvector.
These tests focus on the formatting and utility functions.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.rag import RAGService, get_rag_service


class TestRAGService:
    """Test cases for RAGService"""

    def test_format_context_empty(self):
        """Test formatting empty results"""
        service = RAGService()
        result = service._format_context([])

        assert result == ""

    def test_format_context_single_result(self):
        """Test formatting a single search result"""
        service = RAGService()
        results = [
            {
                "chunk_id": "123",
                "content": "This is test content",
                "similarity": 0.95,
                "metadata": {"heading": "Test Section"},
                "document_filename": "test.md",
            }
        ]

        result = service._format_context(results)

        assert "[Test Section]" in result
        assert "This is test content" in result

    def test_format_context_multiple_results(self):
        """Test formatting multiple search results"""
        service = RAGService()
        results = [
            {
                "chunk_id": "1",
                "content": "First chunk",
                "similarity": 0.95,
                "metadata": {"heading": "Section 1"},
                "document_filename": "test.md",
            },
            {
                "chunk_id": "2",
                "content": "Second chunk",
                "similarity": 0.85,
                "metadata": {"heading": "Section 2"},
                "document_filename": "test.md",
            },
        ]

        result = service._format_context(results)

        assert "[Section 1]" in result
        assert "[Section 2]" in result
        assert "---" in result  # Separator between chunks

    def test_format_context_no_heading(self):
        """Test formatting results without headings"""
        service = RAGService()
        results = [
            {
                "chunk_id": "1",
                "content": "Content without heading",
                "similarity": 0.9,
                "metadata": None,
                "document_filename": "test.md",
            }
        ]

        result = service._format_context(results)

        assert "Content without heading" in result
        assert "[" not in result  # No heading brackets

    def test_format_context_max_length(self):
        """Test that context is truncated to max length"""
        service = RAGService()
        service.MAX_CONTEXT_LENGTH = 50  # Override for testing

        results = [
            {
                "chunk_id": "1",
                "content": "This is a very long content that should be truncated because it exceeds the maximum context length",
                "similarity": 0.9,
                "metadata": None,
                "document_filename": "test.md",
            }
        ]

        result = service._format_context(results)

        assert len(result) <= 60  # Allow some buffer for "..."
        assert "..." in result

    def test_get_rag_service_singleton(self):
        """Test that get_rag_service returns a singleton"""
        service1 = get_rag_service()
        service2 = get_rag_service()

        assert service1 is service2

    @pytest.mark.asyncio
    async def test_build_system_prompt_with_rag_no_context(self):
        """Test building system prompt when no RAG context available"""
        service = RAGService()

        # Create mock persona
        mock_persona = MagicMock()
        mock_persona.persona_prompt = "You are a helpful assistant."
        mock_persona.owner_id = "user123"
        mock_persona.id = "persona123"

        # Mock the get_context method to return empty
        with patch.object(service, 'get_context_for_persona', new_callable=AsyncMock) as mock_get_context:
            mock_get_context.return_value = ""

            mock_db = AsyncMock()
            result = await service.build_system_prompt_with_rag(
                db=mock_db,
                persona=mock_persona,
            )

            assert result == "You are a helpful assistant."

    @pytest.mark.asyncio
    async def test_build_system_prompt_with_rag_with_context(self):
        """Test building system prompt with RAG context"""
        service = RAGService()

        # Create mock persona
        mock_persona = MagicMock()
        mock_persona.persona_prompt = "You are a helpful assistant."
        mock_persona.owner_id = "user123"
        mock_persona.id = "persona123"

        # Mock the get_context method
        with patch.object(service, 'get_context_for_persona', new_callable=AsyncMock) as mock_get_context:
            mock_get_context.return_value = "User likes hiking and programming."

            mock_db = AsyncMock()
            result = await service.build_system_prompt_with_rag(
                db=mock_db,
                persona=mock_persona,
            )

            assert "You are a helpful assistant." in result
            assert "User likes hiking and programming." in result
            assert "사용자에 대해 알고 있는 정보" in result
