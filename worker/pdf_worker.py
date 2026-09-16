import os
import re
import uuid
from pathlib import Path
from contextlib import asynccontextmanager

import certifi
import fitz

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastembed import TextEmbedding
from pymongo import MongoClient
from pymongo.errors import PyMongoError


# ============================================================
# ENVIRONMENT
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
BACKEND_ENV = BASE_DIR.parent / "backend" / ".env"

load_dotenv(BACKEND_ENV)

MONGO_URI = os.getenv(
    "MONGODB_URI",
    "mongodb://localhost:27017"
)

MONGO_DB = os.getenv(
    "MONGODB_DB",
    "cmpdi_ai"
)


# ============================================================
# MONGODB
# ============================================================

def create_mongo_client():
    """
    Create a MongoDB client with proper TLS certificate
    verification for MongoDB Atlas.
    """

    options = {
        "serverSelectionTimeoutMS": 10000,
        "connectTimeoutMS": 10000,
        "socketTimeoutMS": 30000,
        "tls": True,
        "tlsCAFile": certifi.where(),
        "retryWrites": True,
    }

    return MongoClient(MONGO_URI, **options)


client = create_mongo_client()
db = client[MONGO_DB]


# ============================================================
# EMBEDDING MODEL
# ============================================================

model = TextEmbedding(
    model_name="BAAI/bge-small-en-v1.5"
)


# ============================================================
# FASTAPI LIFECYCLE
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Start the worker without crashing if MongoDB is temporarily
    unavailable. MongoDB operations will report their own errors.
    """

    try:
        client.admin.command("ping")

        print("✓ MongoDB connection established")
        print(f"✓ Database: {MONGO_DB}")

        # Helpful indexes for RAG and document retrieval.
        try:
            db.chunks.create_index(
                [("documentId", 1), ("page", 1)]
            )

            db.chunks.create_index(
                [("documentId", 1), ("chunkIndex", 1)],
                unique=True
            )

            db.pages.create_index(
                [("documentId", 1), ("page", 1)],
                unique=True
            )

            db.documents.create_index(
                [("filename", 1)]
            )

            print("✓ MongoDB indexes ready")

        except PyMongoError as exc:
            print(f"⚠ MongoDB index setup warning: {exc}")

    except PyMongoError as exc:
        print("⚠ MongoDB is currently unavailable.")
        print(f"  {exc}")

    yield

    client.close()
    print("✓ MongoDB connection closed")


app = FastAPI(
    title="CMPDI PDF Intelligence Worker",
    description="PDF extraction, evidence indexing and embedding worker",
    version="2.0.0",
    lifespan=lifespan,
)


# ============================================================
# HELPERS
# ============================================================

def bbox_union(boxes):
    """
    Combine multiple bounding boxes into one bounding box.
    """

    if not boxes:
        return {
            "x0": 0,
            "y0": 0,
            "x1": 0,
            "y1": 0,
        }

    return {
        "x0": min(box["x0"] for box in boxes),
        "y0": min(box["y0"] for box in boxes),
        "x1": max(box["x1"] for box in boxes),
        "y1": max(box["y1"] for box in boxes),
    }


def normalize_text(text: str) -> str:
    """
    Normalize PDF text while preserving readable structure.
    """

    if not text:
        return ""

    text = text.replace("\x00", " ")

    # Normalize excessive spaces.
    text = re.sub(r"[ \t]+", " ", text)

    # Normalize excessive blank lines.
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def section_name(text: str) -> str:
    """
    Try to identify a meaningful section heading.

    Handles examples such as:

        1 Introduction
        2.1 Geological Setting
        4.3 Production
        EXECUTIVE SUMMARY
        GEOLOGY AND EXPLORATION
    """

    if not text:
        return "General"

    for line in text.splitlines():

        s = normalize_text(line)

        if not s:
            continue

        # Numbered headings:
        # 1 Introduction
        # 2.1 Geological Setting
        # 3.2.4 Mine Planning
        numbered = re.match(
            r"^\d+(?:\.\d+)*\s+.{3,100}$",
            s
        )

        if numbered:
            return s[:100]

        # Uppercase headings.
        letters = re.sub(r"[^A-Za-z]", "", s)

        if (
            3 < len(s) < 100
            and len(letters) >= 4
            and s.upper() == s
        ):
            return s[:100]

    return "General"


def extract_blocks(page):
    """
    Extract text blocks together with their page coordinates.
    """

    blocks = []

    for raw_block in page.get_text("blocks"):

        if len(raw_block) < 5:
            continue

        x0, y0, x1, y1, text, *_ = raw_block

        text = normalize_text(text)

        if not text:
            continue

        blocks.append({
            "text": text,
            "bbox": {
                "x0": round(float(x0), 2),
                "y0": round(float(y0), 2),
                "x1": round(float(x1), 2),
                "y1": round(float(y1), 2),
            },
        })

    return blocks


def looks_like_table(text, blocks):
    """
    Conservative table detection.

    This intentionally avoids claiming that every visually
    aligned paragraph is a table.
    """

    if not text:
        return False

    if "\t" in text:
        return True

    if "|" in text:
        return True

    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    # Detect repeated numeric/tabular patterns.
    numeric_lines = 0

    for line in lines:
        numbers = re.findall(
            r"\b\d+(?:,\d{3})*(?:\.\d+)?\b",
            line
        )

        if len(numbers) >= 2:
            numeric_lines += 1

    if len(lines) >= 4 and numeric_lines / len(lines) >= 0.5:
        return True

    # Many short blocks often indicate a table.
    short_blocks = sum(
        1
        for block in blocks
        if len(block["text"]) < 80
    )

    if (
        len(blocks) >= 10
        and short_blocks / max(len(blocks), 1) > 0.65
    ):
        return True

    return False


def chunk_page(page_no, blocks, max_chars=2400):
    """
    Convert page blocks into RAG-friendly chunks while
    preserving source page and bounding-box information.
    """

    chunks = []
    current = []
    current_chars = 0

    for block in blocks:

        text = block["text"].strip()

        if not text:
            continue

        # Flush current chunk before exceeding limit.
        if current and current_chars + len(text) > max_chars:

            combined_text = "\n".join(
                item["text"]
                for item in current
            )

            chunks.append({
                "page": page_no,
                "text": combined_text,
                "bbox": bbox_union([
                    item["bbox"]
                    for item in current
                ]),
                "section": section_name(combined_text),
            })

            # Keep a small overlap.
            current = current[-1:]
            current_chars = len(current[0]["text"])

        current.append(block)
        current_chars += len(text)

    if current:

        combined_text = "\n".join(
            item["text"]
            for item in current
        )

        chunks.append({
            "page": page_no,
            "text": combined_text,
            "bbox": bbox_union([
                item["bbox"]
                for item in current
            ]),
            "section": section_name(combined_text),
        })

    return chunks


def safe_delete_document_data(document_id):
    """
    Delete old page/chunk data before re-indexing a document.
    """

    db.chunks.delete_many({
        "documentId": document_id
    })

    db.pages.delete_many({
        "documentId": document_id
    })


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():

    mongo_ok = False

    try:
        client.admin.command("ping")
        mongo_ok = True
    except PyMongoError:
        mongo_ok = False

    return {
        "ok": True,
        "service": "pdf-worker",
        "mongodb": mongo_ok,
        "database": MONGO_DB,
    }


# ============================================================
# EMBEDDING API
# ============================================================

@app.post("/embed")
def embed(payload: dict):

    text = payload.get("text", "").strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="text is required"
        )

    try:

        vector = next(
            model.embed([text])
        ).tolist()

        return {
            "embedding": vector
        }

    except Exception as exc:

        print(f"Embedding error: {exc}")

        raise HTTPException(
            status_code=500,
            detail="Unable to generate embedding"
        )


# ============================================================
# PDF PROCESSING
# ============================================================

@app.post("/process")
async def process(
    file: UploadFile = File(...),
    document_id: str = Form(...)
):

    # --------------------------------------------------------
    # Validate upload
    # --------------------------------------------------------

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Filename is required"
        )

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="PDF required"
        )

    if not document_id.strip():
        raise HTTPException(
            status_code=400,
            detail="document_id is required"
        )

    # --------------------------------------------------------
    # Read PDF
    # --------------------------------------------------------

    data = await file.read()

    if not data:
        raise HTTPException(
            status_code=400,
            detail="Uploaded PDF is empty"
        )

    temp_path = (
        Path("/tmp")
        / f"cmpdi-{uuid.uuid4()}.pdf"
    )

    temp_path.write_bytes(data)

    doc = None

    try:

        # ----------------------------------------------------
        # Open PDF
        # ----------------------------------------------------

        try:
            doc = fitz.open(str(temp_path))

        except Exception as exc:

            raise HTTPException(
                status_code=400,
                detail=f"Invalid PDF: {exc}"
            )

        if doc.page_count == 0:

            raise HTTPException(
                status_code=400,
                detail="PDF contains no pages"
            )

        # ----------------------------------------------------
        # Extraction containers
        # ----------------------------------------------------

        pages = []
        all_chunks = []
        text_all = []

        sections = set()

        total_words = 0
        total_characters = 0
        table_count = 0

        # ----------------------------------------------------
        # Process every page
        # ----------------------------------------------------

        for page_number, page in enumerate(
            doc,
            start=1
        ):

            blocks = extract_blocks(page)

            page_text = "\n".join(
                block["text"]
                for block in blocks
            )

            page_text = normalize_text(page_text)

            word_count = len(
                page_text.split()
            )

            char_count = len(
                page_text
            )

            total_words += word_count
            total_characters += char_count

            text_all.append(page_text)

            # ----------------------------------------------
            # Section
            # ----------------------------------------------

            section = section_name(page_text)

            if section != "General":
                sections.add(section)

            # ----------------------------------------------
            # Table detection
            # ----------------------------------------------

            if looks_like_table(
                page_text,
                blocks
            ):
                table_count += 1

            # ----------------------------------------------
            # Page metadata
            # ----------------------------------------------

            page_record = {
                "page": page_number,
                "blocks": blocks,
                "charCount": char_count,
                "wordCount": word_count,
                "width": round(
                    float(page.rect.width),
                    2
                ),
                "height": round(
                    float(page.rect.height),
                    2
                ),
                "section": section,
                "hasText": bool(page_text),
                "hasTable": looks_like_table(
                    page_text,
                    blocks
                ),
            }

            pages.append(page_record)

            # ----------------------------------------------
            # RAG chunks
            # ----------------------------------------------

            page_chunks = chunk_page(
                page_number,
                blocks
            )

            all_chunks.extend(
                page_chunks
            )

        # ----------------------------------------------------
        # Generate embeddings
        # ----------------------------------------------------

        chunks = []

        if all_chunks:

            texts = [
                chunk["text"]
                for chunk in all_chunks
            ]

            embeddings = list(
                model.embed(texts)
            )

            for index, (
                chunk,
                vector
            ) in enumerate(
                zip(all_chunks, embeddings)
            ):

                chunks.append({
                    "_id": (
                        f"{document_id}:{index}"
                    ),

                    "documentId": document_id,

                    "chunkIndex": index,

                    "page": chunk["page"],

                    "text": chunk["text"],

                    "bbox": chunk["bbox"],

                    "embedding": vector.tolist(),

                    "metadata": {
                        "sourceType": "pdf",
                        "section": chunk["section"],
                        "filename": file.filename,
                    },
                })

        # ----------------------------------------------------
        # MongoDB
        # ----------------------------------------------------

        try:

            # Remove previous indexing.
            safe_delete_document_data(
                document_id
            )

            # Insert pages.
            if pages:

                db.pages.insert_many([
                    {
                        "documentId": document_id,
                        **page,
                    }
                    for page in pages
                ])

            # Insert RAG chunks.
            if chunks:

                db.chunks.insert_many(
                    chunks
                )

            # ------------------------------------------------
            # Analytics
            # ------------------------------------------------

            analytics = {

                "pages": len(pages),

                "words": total_words,

                "characters": total_characters,

                "chunks": len(chunks),

                "sections": len(sections),

                "tables": table_count,

                "textPages": sum(
                    1
                    for page in pages
                    if page["hasText"]
                ),

                "topSections": sorted(
                    sections
                )[:15],

                "processingVersion": "2.0",

            }

            # ------------------------------------------------
            # Document metadata
            # ------------------------------------------------

            document_record = {

                "_id": document_id,

                "filename": file.filename,

                "mimeType": "application/pdf",

                "fileSize": len(data),

                "analytics": analytics,

                "processing": {

                    "status": "completed",

                    "pages": len(pages),

                    "chunks": len(chunks),

                },

            }

            db.documents.update_one(
                {
                    "_id": document_id
                },
                {
                    "$set": document_record
                },
                upsert=True
            )

        except PyMongoError as exc:

            print(
                f"MongoDB processing error: {exc}"
            )

            raise HTTPException(
                status_code=503,
                detail=(
                    "Document extraction completed, "
                    "but MongoDB indexing failed."
                )
            )

        # ----------------------------------------------------
        # Response
        # ----------------------------------------------------

        return {
            "ok": True,
            "documentId": document_id,
            **analytics,
        }

    except HTTPException:
        raise

    except Exception as exc:

        print(
            f"PDF processing error: {exc}"
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to process document"
        )

    finally:

        if doc is not None:
            doc.close()

        try:
            temp_path.unlink(
                missing_ok=True
            )
        except OSError:
            pass