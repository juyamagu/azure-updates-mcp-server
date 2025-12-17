# Azure Updates API Manual

This document describes the data source for collecting Azure updates information.

- Azure Updates API
- Manual data source (planned for future implementation)

## Azure Updates API

### Overview

**Base Endpoint:** `https://www.microsoft.com/releasecommunications/api/v2/azure`

**Protocol:** OData v4 (Open Data Protocol)

**Metadata:** `https://www.microsoft.com/releasecommunications/api/v2/$metadata`

**Total Records:** ~9,300+ items (as of 2025-12-16)

### OData Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `$count` | boolean | Include total count in response | `true` or `false` |
| `top` | integer | Number of items to return (pagination) | `10`, `50`, `100` |
| `skip` | integer | Number of items to skip (pagination) | `0`, `20`, `100` |
| `$filter` | string | OData filter expression | See filter examples below |
| `orderby` | string | Sort field and direction | `modified desc`, `created asc` |
| `$select` | string | Fields to include in response | `id,title,modified,tags` |

⚠️ **Note:** Parameter names starting with `$` must be properly encoded in URLs (`$count` → `$count`, `$filter` → `$filter`)

### Data Schema

#### Core Fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | string | No | Unique identifier (numeric or slug format) |
| `title` | string | Yes | Update title |
| `description` | string | Yes | HTML content with embedded styles and links |
| `tags` | array[string] | Yes | Categorization tags (e.g., "Retirements", "Features") |
| `productCategories` | array[string] | Yes | Product category classifications |
| `products` | array[string] | Yes | Specific Azure product names |
| `status` | string | Yes | Lifecycle status (see values below) |
| `created` | DateTimeOffset | No | Creation timestamp (ISO 8601 with timezone) |
| `modified` | DateTimeOffset | No | Last modification timestamp (use for differential updates) |
| `locale` | string | Yes | Locale code (typically null) |
| `generalAvailabilityDate` | string | Yes | GA date in `YYYY-MM` format |
| `previewAvailabilityDate` | string | Yes | Preview date in `YYYY-MM` format |
| `privatePreviewAvailabilityDate` | string | Yes | Private preview date in `YYYY-MM` format |
| `availabilities` | array[object] | Yes | Availability timeline (see structure below) |

#### Availability Object Structure

```json
{
  "ring": "General Availability | Preview | Private Preview | Retirement",
  "year": 2025,
  "month": "January | February | March | April | May | June | July | August | September | October | November | December"
}
```

#### Observed Field Values

⚠️ **Important:** All values listed below are observations from the current dataset (as of 2025-12-16) and may not be exhaustive. New values may be added without notice.

**tags** (13 observed):
- Compliance
- Features
- Management
- Microsoft Build
- Microsoft Ignite
- Open Source
- Operating System
- Pricing & Offerings
- Regions & Datacenters
- **Retirements** ⭐
- SDK and Tools
- Security
- Services

**status** (3 observed):
- `In development`
- `In preview`
- `Launched`
- `null` (commonly used for Retirements)

**productCategories** (17 observed):
- AI + machine learning
- Analytics
- Compute
- Containers
- Databases
- DevOps
- Developer tools
- Hybrid + multicloud
- Integration
- Internet of Things
- Management and governance
- Migration
- Mobile
- Networking
- Security
- Storage
- Web

**availabilities.ring** (4 observed):
- `General Availability`
- `Preview`
- `Private Preview`
- `Retirement`

### Filter Examples

#### Basic Tag Filtering

**Retirements only:**
```
$filter=tags/any(f:f eq 'Retirements')
```

**Security updates:**
```
$filter=tags/any(f:f eq 'Security')
```

**Multiple tags (OR condition):**
```
$filter=(tags/any(f:f eq 'Retirements') or tags/any(f:f eq 'Security'))
```

#### Date Range Filtering

**Modified since a specific date:**
```
$filter=modified gt 2025-02-01T00:00:00.000Z
```

**Modified within a specific period:**
```
$filter=modified gt 2025-02-01T00:00:00.000Z and modified lt 2025-03-01T00:00:00.000Z
```

**Created in December 2025:**
```
$filter=created ge 2025-12-01T00:00:00.000Z and created lt 2026-01-01T00:00:00.000Z
```

#### Product Category Filtering

**Security-related products:**
```
$filter=productCategories/any(c:c eq 'Security')
```

**AI or Analytics categories:**
```
$filter=(productCategories/any(c:c eq 'AI + machine learning') or productCategories/any(c:c eq 'Analytics'))
```

#### Combined Filters

**Retirements updated since February 2025:**
```
$filter=tags/any(f:f eq 'Retirements') and modified gt 2025-02-01T00:00:00.000Z
```

**Security retirements in 2026:**
```
$filter=tags/any(f:f eq 'Retirements') and productCategories/any(c:c eq 'Security') and modified gt 2025-12-31T23:59:59.999Z
```

#### Null Value Filtering

**Items without status:**
```
$filter=status eq null
```

**Items with GA date:**
```
$filter=generalAvailabilityDate ne null
```

### Query Examples

#### Example 1: Basic Retrieval (Retirements, Latest 10)

**URL:**
```
https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=10&skip=0&$filter=tags/any(f:f%20eq%20%27Retirements%27)&orderby=modified%20desc
```

**Breakdown:**
- `$count=true` - Include total count
- `top=10` - Return 10 items
- `skip=0` - Start from beginning
- `$filter=tags/any(f:f eq 'Retirements')` - Only retirements
- `orderby=modified desc` - Newest first

**Expected Result:** ~563 total retirements, returns first 10 sorted by modification date

---

#### Example 2: Differential Update (Since Last Check)

**URL:**
```
https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=100&$filter=modified%20gt%202025-12-01T00:00:00.000Z&orderby=modified%20desc
```

**Breakdown:**
- Retrieves all updates modified after December 1, 2025
- Use for incremental synchronization
- Store the latest `modified` timestamp and use it in next query

**Use Case:** Periodic polling to detect new or updated items

---

#### Example 3: Field Selection (Reduce Payload)

**URL:**
```
https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=50&$select=id,title,modified,tags&$filter=tags/any(f:f%20eq%20%27Retirements%27)&orderby=modified%20desc
```

**Breakdown:**
- `$select=id,title,modified,tags` - Only return specified fields
- Reduces response size significantly (no HTML description)

**Response:**
```json
{
  "@odata.context": "https://www.microsoft.com/releasecommunications/api/v2/$metadata#Azure(id,title,modified,tags)",
  "@odata.count": 563,
  "value": [
    {
      "id": "515484",
      "tags": ["Retirements"],
      "title": "Update: The retirement date for default outbound access...",
      "modified": "2025-12-12T11:30:27.0841562Z"
    }
  ]
}
```

---

#### Example 4: Pagination (Page 2 of Results)

**URL:**
```
https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=50&skip=50&$filter=tags/any(f:f%20eq%20%27Retirements%27)&orderby=modified%20desc
```

**Breakdown:**
- `skip=50` - Skip first 50 items (page 1)
- Returns items 51-100

**Pagination Logic:**
```
Page 1: top=50, skip=0   (items 1-50)
Page 2: top=50, skip=50  (items 51-100)
Page 3: top=50, skip=100 (items 101-150)
...
Last page when: skip + returned_count >= @odata.count
```

---

#### Example 5: Complex Filter (Security Retirements in 2026)

**URL:**
```
https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=20&$filter=tags/any(t:t%20eq%20%27Retirements%27)%20and%20productCategories/any(c:c%20eq%20%27Security%27)%20and%20modified%20gt%202025-12-31T23:59:59.999Z&orderby=modified%20desc
```

**Breakdown:**
- Multiple conditions with `and`
- Filters on both tags and product categories
- Date range for 2026 onwards

---

#### Example 6: Get Only Count (No Data)

**URL:**
```
https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=0&$filter=tags/any(f:f%20eq%20%27Retirements%27)
```

**Breakdown:**
- `top=0` - Don't return any items
- Use to get count without downloading data

**Response:**
```json
{
  "@odata.context": "...",
  "@odata.count": 563,
  "value": []
}
```

### Response Format

#### Response Structure

**Root Level:**
```json
{
  "@odata.context": "string",  // OData metadata URL
  "@odata.count": number,      // Total matching records (if $count=true)
  "value": []                  // Array of update objects
}
```

#### Complete Example Response

**Request:**
```
GET https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=2&$filter=tags/any(f:f%20eq%20%27Retirements%27)&orderby=modified%20desc
```

**Response:**
```json
{
  "@odata.context": "https://www.microsoft.com/releasecommunications/api/v2/$metadata#Azure",
  "@odata.count": 563,
  "value": [
    {
      "id": "515484",
      "productCategories": ["Compute"],
      "tags": ["Retirements"],
      "products": ["Batch"],
      "generalAvailabilityDate": null,
      "previewAvailabilityDate": null,
      "privatePreviewAvailabilityDate": null,
      "title": "Update: The retirement date for default outbound access has been extended to March 31, 2026.",
      "description": "<div style=\"font-family: Arial; font-size: 10pt;\">...</div>",
      "status": null,
      "created": "2025-12-12T11:30:27.0841562Z",
      "modified": "2025-12-12T11:30:27.0841562Z",
      "locale": null,
      "availabilities": [
        {
          "ring": "Retirement",
          "year": 2026,
          "month": "March"
        }
      ]
    },
    {
      "id": "501668",
      "productCategories": ["AI + machine learning", "Internet of Things"],
      "tags": ["Retirements", "Features"],
      "products": ["Azure Machine Learning"],
      "generalAvailabilityDate": null,
      "previewAvailabilityDate": null,
      "privatePreviewAvailabilityDate": null,
      "title": "Retirement: Remove dependency on these Azure ML SDKs before June 30, 2026",
      "description": "<div style=\"\">...</div>",
      "status": null,
      "created": "2025-12-03T21:00:12.7981410Z",
      "modified": "2025-12-03T21:00:12.7981410Z",
      "locale": null,
      "availabilities": [
        {
          "ring": "Retirement",
          "year": 2026,
          "month": "June"
        }
      ]
    }
  ]
}
```

#### Field Value Notes

**description Field:**
- Contains HTML markup with embedded inline styles
- May include base64-encoded SVG images in style attributes
- Commonly includes `&quot;` for quotes, `&nbsp;` for spaces
- Can be very large (5KB-20KB per item)
- Consider using `$select` to exclude this field when not needed

**Date Fields Format:**
- `created`, `modified`: ISO 8601 with 7-digit fractional seconds
  - Example: `2025-12-12T11:30:27.0841562Z`
- `generalAvailabilityDate`, `previewAvailabilityDate`, `privatePreviewAvailabilityDate`: Year-Month only
  - Example: `2025-03`, `2021-11`
  - Often `null`

**Empty Arrays:**
- `productCategories`, `tags`, `products` can be empty arrays `[]`
- Still included in response, never `null`

**Null Values:**
- `status`, `locale` are frequently `null`
- Date fields are commonly `null`
- `availabilities` can be an empty array but not `null`

### Differential Update Strategy

#### Overview

Use the `modified` field to implement incremental synchronization and avoid fetching the entire dataset on each run.

#### Implementation Pattern

**Initial Load (Empty Database):**
```
1. Fetch all records with your target filter (e.g., Retirements)
2. Store in database with `id` as primary key
3. Record the maximum `modified` timestamp as last_sync_time
```

**Subsequent Updates:**
```
1. Query: $filter=modified ge {last_sync_time}
2. UPSERT records using `id` as key
3. Update last_sync_time to the maximum `modified` from results
```

**Important:** Use `ge` (>=) instead of `gt` (>) to handle multiple updates with the same timestamp. 
The API may publish multiple updates at exactly the same time, and using `gt` would miss records 
that share the timestamp with the last synced record.

#### Example Workflow

**Step 1: Initial Load**
```bash
# Fetch all retirements
curl 'https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=100&$filter=tags/any(f:f%20eq%20%27Retirements%27)&orderby=modified%20desc'

# Store records and capture max modified: "2025-12-12T11:30:27.0841562Z"
```

**Step 2: Incremental Update (Next Run)**
```bash
# Only fetch items modified since last sync (use 'ge' to include same timestamp)
curl 'https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=100&$filter=tags/any(f:f%20eq%20%27Retirements%27)%20and%20modified%20ge%202025-12-12T11:30:27.0841562Z&orderby=modified%20desc'

# UPSERT results (handles both new items and updates to existing items)
```

#### Key Considerations

**Idempotency:**
- Use `id` as unique key for UPSERT operations
- Running the same sync multiple times produces identical results
- Handles retries and failures gracefully

**Modified vs Created:**
- Use `modified` (not `created`) for differential detection
- Items can be updated after creation (title changes, date extensions, etc.)
- `modified` captures both new items and updates to existing items

**Timestamp Precision:**
- API returns timestamps with 7-digit fractional seconds
- Store full precision to avoid missing updates
- Use `gt` (greater than), not `ge` (greater or equal) to avoid duplicates

**Handling Large Initial Loads:**
```python
# Pseudo-code for paginated initial load
page_size = 100
skip = 0
last_sync = None

while True:
    url = f"...?$count=true&top={page_size}&skip={skip}&$filter=tags/any(f:f eq 'Retirements')&orderby=modified desc"
    response = fetch(url)
    
    if not response.value:
        break
    
    upsert_records(response.value)
    last_sync = max(record.modified for record in response.value)
    skip += page_size
    
    if skip >= response["@odata.count"]:
        break

save_checkpoint(last_sync)
```

**Error Handling:**
- Store checkpoint only after successful database commit
- On failure, next run will retry from last known good state
- Consider using `$select` to reduce payload and improve reliability

## Manual Data Source

In the future, we plan to implement a manual data source that allows administrators to manually add and edit retirement information. This will enable coverage of retirement information not included in the Azure Updates API.

---

## Advanced Topics

### URL Encoding Reference

Common characters that need encoding in OData filters:

| Character | Encoded | Example Context |
|-----------|---------|-----------------|
| Space | `%20` | `modified%20desc` |
| Single quote | `%27` | `%27Retirements%27` |
| Parentheses | `%28` `%29` | Optional (usually works unencoded) |
| Colon | `%3A` | In timestamps: `2025-01-01T00%3A00%3A00.000Z` |

**Example:**
```
Unencoded: $filter=tags/any(f:f eq 'Retirements') and modified gt 2025-01-01T00:00:00.000Z
Encoded:   $filter=tags/any(f:f%20eq%20%27Retirements%27)%20and%20modified%20gt%202025-01-01T00:00:00.000Z
```

### Performance Optimization

**1. Use Field Selection:**
```
# Bad: Fetch all fields (large payload)
?top=100&$filter=tags/any(f:f eq 'Retirements')

# Good: Select only needed fields
?top=100&$filter=tags/any(f:f eq 'Retirements')&$select=id,title,modified,availabilities
```

**2. Pagination Strategy:**
- For large datasets (>1000 items), use reasonable page sizes (50-100)
- Don't fetch all data in one request
- Implement cursor-based pagination using `modified` timestamps for better performance

**3. Minimize Requests:**
```
# Bad: Check count first, then fetch data (2 requests)
Request 1: ?$count=true&top=0
Request 2: ?top=100

# Good: Fetch data with count in one request
?$count=true&top=100
```

### Error Handling

**HTTP Status Codes:**
- `200 OK` - Successful request
- `400 Bad Request` - Invalid OData syntax or parameter
- `404 Not Found` - Invalid endpoint
- `500 Internal Server Error` - API error (retry with exponential backoff)

**Common Errors:**

**Invalid filter syntax:**
```json
{
  "error": {
    "code": "",
    "message": "The query specified in the URI is not valid..."
  }
}
```

**Handling:**
- Validate filter syntax before sending
- Use proper URL encoding
- Check OData v4 specification for syntax rules

### Rate Limiting

**Observations:**
- No explicit rate limit documented
- No rate-limit headers observed in responses
- Recommended: Implement exponential backoff on 5xx errors
- Be respectful: Don't hammer the API unnecessarily

**Best Practices:**
```python
import time

def fetch_with_retry(url, max_retries=3):
    for attempt in range(max_retries):
        response = requests.get(url)
        if response.status_code == 200:
            return response.json()
        elif response.status_code >= 500:
            wait_time = 2 ** attempt  # 1s, 2s, 4s
            time.sleep(wait_time)
        else:
            raise Exception(f"Error {response.status_code}")
    raise Exception("Max retries exceeded")
```

## API Characteristics and Limitations

### Data Completeness
- **Non-exhaustive enumerations**: Tag names, product categories, availability rings, and other categorical values observed in this document are based on current data analysis and may not be complete.
- **Future additions**: Microsoft may introduce new values without API versioning or advance notice.
- **Recommendation**: Implement flexible string handling and avoid hardcoding enumeration sets. Treat all categorical fields as open-ended strings.

### Schema Stability
- **OData metadata**: Schema is defined at `https://www.microsoft.com/releasecommunications/api/v2/$metadata`
- **Field types**: Stable (unlikely to change without API versioning)
- **Field values**: Dynamic (new tags, categories, products can be added anytime)
- **Backward compatibility**: Adding new fields or values is considered backward-compatible

### Implementation Guidelines
1. **Dynamic value handling**: Design your system to accept and store unknown tag/category values
2. **Metadata monitoring**: Periodically check the OData `$metadata` endpoint for schema changes
3. **Defensive coding**: Use inclusive filtering (accept unknown values) rather than exclusive validation
4. **Logging**: Log any unexpected values for monitoring and alerting purposes
5. **HTML handling**: Parse `description` field carefully; contains arbitrary HTML with inline styles
6. **Timestamp precision**: Store full timestamp precision (7 decimal places) for accurate differential updates

### Known Limitations

**No Full-Text Search:**
- OData filters work on exact matches and comparisons only
- No `contains`, `startswith`, or `endswith` on tags/categories
- For text search in titles/descriptions, fetch and filter client-side

**No Aggregations:**
- No `$apply` or grouping operations
- Count by tag requires client-side processing

**Date Field Limitations:**
- Availability dates are strings in `YYYY-MM` format (not proper dates)
- Cannot filter by specific availability month/year directly
- Must filter on `modified` or `created` timestamps instead

**Description Field:**
- Extremely large (5KB-20KB)
- Contains raw HTML with embedded styles
- May include data URLs for inline images
- Recommendation: Exclude with `$select` unless specifically needed

## Testing and Validation

### Quick Test Commands

**1. Check API availability:**
```bash
curl -s 'https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=1' | jq '.["@odata.count"]'
# Expected: Large number (9000+)
```

**2. Verify filter syntax:**
```bash
curl -s 'https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=0&$filter=tags/any(f:f%20eq%20%27Retirements%27)' | jq '.["@odata.count"]'
# Expected: 500-600 (retirements count)
```

**3. Test differential update:**
```bash
# Get recent updates
curl -s 'https://www.microsoft.com/releasecommunications/api/v2/azure?$count=true&top=5&$filter=modified%20gt%202025-12-01T00:00:00.000Z&orderby=modified%20desc&$select=id,title,modified' | jq '.value'
```

**4. Validate field selection:**
```bash
curl -s 'https://www.microsoft.com/releasecommunications/api/v2/azure?top=1&$select=id,title&$filter=tags/any(f:f%20eq%20%27Retirements%27)' | jq '.value[0] | keys'
# Expected: ["id", "title"]
```

### Useful jq Queries

**Extract all unique tags:**
```bash
curl -s 'https://www.microsoft.com/releasecommunications/api/v2/azure?top=500' | jq '[.value[].tags] | flatten | unique | sort'
```

**Get retirement dates:**
```bash
curl -s 'https://www.microsoft.com/releasecommunications/api/v2/azure?top=20&$filter=tags/any(f:f%20eq%20%27Retirements%27)' | jq '.value[] | {title: .title, date: .availabilities[0]}'
```

**Count items by status:**
```bash
curl -s 'https://www.microsoft.com/releasecommunications/api/v2/azure?top=1000' | jq '[.value[].status] | group_by(.) | map({status: .[0], count: length})'
```

## Manual Data Source

In the future, we plan to implement a manual data source that allows administrators to manually add and edit retirement information. This will enable coverage of retirement information not included in the Azure Updates API.

---

## Summary

### Key Points to Remember

1. ✅ **Always include `$count=true`** for total count and pagination
2. ✅ **Use `modified` field** for differential updates
3. ✅ **Implement UPSERT with `id`** as unique key
4. ✅ **Use `$select`** to reduce payload when possible
5. ✅ **Proper URL encoding** for filter expressions
6. ⚠️ **Don't hardcode** tag/category values (they can expand)
7. ⚠️ **HTML description** is large; exclude if not needed
8. ⚠️ **Timestamps have 7 decimals**; preserve precision

### Quick Reference

| Task | Query Parameter |
|------|----------------|
| Get total count | `$count=true&top=0` |
| Pagination | `top={page_size}&skip={offset}` |
| Retirements only | `$filter=tags/any(f:f eq 'Retirements')` |
| Recent updates | `$filter=modified gt {timestamp}` |
| Sort newest first | `orderby=modified desc` |
| Reduce payload | `$select=id,title,modified,tags` |

### API Endpoints Summary

| Purpose | URL |
|---------|-----|
| Main endpoint | `https://www.microsoft.com/releasecommunications/api/v2/azure` |
| Metadata | `https://www.microsoft.com/releasecommunications/api/v2/$metadata` |

---

**Document Version**: 1.0  
**Last Updated**: 2025-12-16  
**API Analysis Date**: 2025-12-16  
**Total Records Analyzed**: 9,316 items
