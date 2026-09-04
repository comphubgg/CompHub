# Script to update tournaments API with imageUrl, status, NAC data, and removed ranked cups

$todayDate = '2026-06-21'

# Read current file
$content = Get-Content "c:\Users\jumik\Desktop\streamer-dashboard\app\api\tournaments\route.ts" -Raw

# Helper function to get status and imageUrl based on tournament type and date
function Get-TournamentStatus {
    param([string]$date, [string]$type)
    
    $statusValue = if ([DateTime]$date -lt [DateTime]$todayDate) { 'completed' } else { 'upcoming' }
    
    $imageUrls = @{
        'fncs' = '/tournaments/fncs.jpg'
        'performance' = '/tournaments/performance-eval.jpg'
        'cash' = '/tournaments/cash-cup.jpg'
        'reload' = '/tournaments/reload-elite.jpg'
    }
    
    return @{
        status = $statusValue
        imageUrl = $imageUrls[$type]
    }
}

# Step 1: Remove all Ranked Cup entries (all lines with type: 'ranked')
$lines = $content -split "`n"
$filteredLines = @()
$skipUntilClose = $false

foreach ($line in $lines) {
    if ($line -match "type: 'ranked'") {
        $skipUntilClose = $true
    }
    
    if (-not $skipUntilClose) {
        $filteredLines += $line
    }
    
    # Stop skipping when we close the bracket
    if ($skipUntilClose -and $line -match '^\s+},?\s*$' -and $line -notmatch 'type:') {
        $skipUntilClose = $false
    }
}

$content = $filteredLines -join "`n"

# Step 2: Update Interface
$oldInterface = @"
interface Tournament {
  id: string;
  date: string;
  time: string;
  name: string;
  category: string;
  round: string;
  region: string;
  type: 'fncs' | 'performance' | 'cash' | 'ranked' | 'reload';
  winner?: string;
  platforms?: string[];
}
"@

$newInterface = @"
interface Tournament {
  id: string;
  date: string;
  time: string;
  name: string;
  category: string;
  round: string;
  region: string;
  type: 'fncs' | 'performance' | 'cash' | 'reload';
  status: 'completed' | 'upcoming' | 'live';
  winner?: string;
  platforms?: string[];
  imageUrl?: string;
}
"@

$content = $content -replace [regex]::Escape($oldInterface), $newInterface

# Step 3: Add status and imageUrl to each tournament entry
# This is complex, so we'll use a regex approach to find and modify tournament objects

$pattern = "(\{[^}]*?id: '[^']*'[^}]*?date: '([^']*)'[^}]*?type: '([^']*)'[^}]*?)(\},?)"

$matches = [regex]::Matches($content, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)

Write-Host "Found $($matches.Count) tournament entries"

# For now, output the filtered content to see progress
$content | Out-File "c:\Users\jumik\Desktop\streamer-dashboard\app\api\tournaments\route.ts" -Force -Encoding UTF8

Write-Host "Updated tournaments file (ranked cups removed, ready for imageUrl/status)"
