import random
from collections import deque

COLORS = [
    '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
    '#1ABC9C', '#E67E22', '#E91E63', '#00BCD4', '#8BC34A'
]

# ---------------------------------------------------------------------------
# Neighbor functions per grid type
# ---------------------------------------------------------------------------

def sq_neighbors(r, c, rows, cols):
    return [(r+dr, c+dc) for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]
            if 0 <= r+dr < rows and 0 <= c+dc < cols]

def hex_neighbors(r, c, rows, cols):
    dirs = [(-1,-1),(-1,0),(0,-1),(0,1),(1,-1),(1,0)] if r % 2 == 0 \
        else [(-1,0),(-1,1),(0,-1),(0,1),(1,0),(1,1)]
    return [(r+dr, c+dc) for dr, dc in dirs
            if 0 <= r+dr < rows and 0 <= c+dc < cols]

def tri_neighbors(r, c, rows, cols):
    is_up = (r + c) % 2 == 0
    result = [(r, c-1), (r, c+1)]
    if is_up and r+1 < rows:
        result.append((r+1, c))
    elif not is_up and r-1 >= 0:
        result.append((r-1, c))
    return [(nr, nc) for nr, nc in result if 0 <= nc < cols]

NEIGHBOR_FN = {'square': sq_neighbors, 'rect': sq_neighbors,
               'hex': hex_neighbors, 'tri': tri_neighbors}

def get_neighbors(grid_type, r, c, rows, cols):
    return NEIGHBOR_FN[grid_type](r, c, rows, cols)

def boundary_cells(grid_type, rows, cols):
    """Cells that have fewer neighbors than the max — i.e., on the border."""
    cells = []
    max_n = {'square': 4, 'rect': 4, 'hex': 6, 'tri': 3}[grid_type]
    for r in range(rows):
        for c in range(cols):
            if len(get_neighbors(grid_type, r, c, rows, cols)) < max_n:
                cells.append((r, c))
    return cells

# ---------------------------------------------------------------------------
# Path generation: random walk from a boundary cell inward
# ---------------------------------------------------------------------------

def random_walk(start, length, occupied, grid_type, rows, cols):
    path = [start]
    visited = {start}
    for _ in range(length - 1):
        r, c = path[-1]
        nbrs = [n for n in get_neighbors(grid_type, r, c, rows, cols)
                if n not in visited and n not in occupied]
        random.shuffle(nbrs)
        if not nbrs:
            break
        nxt = nbrs[0]
        path.append(nxt)
        visited.add(nxt)
    return path

# ---------------------------------------------------------------------------
# Solver: BFS over game states to verify solvability
# State = tuple of (head_index per snake) — head_index advances as snake moves
# ---------------------------------------------------------------------------

def solve(snakes_data, grid_type, rows, cols):
    """Returns a valid move order (list of snake ids) or None if unsolvable."""
    n = len(snakes_data)
    rails = [tuple(s['rail']) for s in snakes_data]
    lens  = [s['body_length'] for s in snakes_data]

    # head_idx[i] = index of head in rails[i]; body = rails[i][hi-li+1 : hi+1]
    init_hi = tuple(l - 1 for l in lens)

    def body_cells(i, hi):
        li = lens[i]
        start = max(0, hi - li + 1)
        return set(rails[i][start:hi+1])

    def occupied(heads):
        occ = {}
        for i, hi in enumerate(heads):
            if hi >= len(rails[i]):
                continue  # exited
            for cell in body_cells(i, hi):
                occ[cell] = i
        return occ

    def can_move(i, heads):
        hi = heads[i]
        if hi >= len(rails[i]) - 1:
            return True  # last step → exits
        next_cell = rails[i][hi + 1]
        occ = occupied(heads)
        return next_cell not in occ or occ[next_cell] == i

    def move(i, heads):
        lst = list(heads)
        lst[i] = min(lst[i] + 1, len(rails[i]))
        return tuple(lst)

    def exited(i, heads):
        return heads[i] >= len(rails[i])

    goal = tuple(len(r) for r in rails)
    queue = deque([(init_hi, [])])
    visited = {init_hi}

    while queue:
        heads, order = queue.popleft()
        if heads == goal:
            return order
        for i in range(n):
            if exited(i, heads):
                continue
            if can_move(i, heads):
                nh = move(i, heads)
                # Keep moving snake i until blocked or exited (slide animation)
                # For solver just one step at a time
                if nh not in visited:
                    visited.add(nh)
                    queue.append((nh, order + [i]))
    return None

# ---------------------------------------------------------------------------
# Level generator
# ---------------------------------------------------------------------------

DIFFICULTY_PARAMS = {
    1: dict(rows=4, cols=4,  num_snakes=2, body_len=(2,3), future_len=(1,2), grid_types=['square']),
    2: dict(rows=5, cols=5,  num_snakes=3, body_len=(2,3), future_len=(2,3), grid_types=['square','rect']),
    3: dict(rows=5, cols=7,  num_snakes=3, body_len=(3,4), future_len=(2,3), grid_types=['square','rect','hex']),
    4: dict(rows=6, cols=6,  num_snakes=4, body_len=(3,4), future_len=(2,4), grid_types=['square','hex']),
    5: dict(rows=6, cols=8,  num_snakes=4, body_len=(3,5), future_len=(3,4), grid_types=['square','hex','tri']),
    6: dict(rows=7, cols=7,  num_snakes=5, body_len=(4,5), future_len=(3,5), grid_types=['hex','tri']),
    7: dict(rows=8, cols=8,  num_snakes=5, body_len=(4,6), future_len=(3,5), grid_types=['hex','tri']),
}

def get_params(difficulty):
    d = min(difficulty, max(DIFFICULTY_PARAMS.keys()))
    return DIFFICULTY_PARAMS[d]

def generate_level(difficulty=1, max_attempts=200):
    params = get_params(difficulty)
    rows        = params['rows']
    cols        = params['cols']
    num_snakes  = params['num_snakes']
    bmin, bmax  = params['body_len']
    fmin, fmax  = params['future_len']
    grid_type   = random.choice(params['grid_types'])

    colors = random.sample(COLORS, num_snakes)

    for attempt in range(max_attempts):
        body_occupied = set()   # cells used by snake bodies
        snakes_data = []
        ok = True

        bound = boundary_cells(grid_type, rows, cols)
        if len(bound) < num_snakes:
            ok = False

        if ok:
            random.shuffle(bound)
            used_exits = set()

            for i in range(num_snakes):
                placed = False
                for _ in range(60):
                    # Pick boundary exit cell
                    exits = [b for b in bound if b not in used_exits]
                    if not exits:
                        break
                    exit_cell = random.choice(exits)

                    body_len   = random.randint(bmin, bmax)
                    future_len = random.randint(fmin, fmax)

                    # Walk inward from exit to create the FUTURE path (what comes after body)
                    # Then extend further inward for the body
                    future_path = random_walk(exit_cell, future_len + 1,
                                              body_occupied, grid_type, rows, cols)
                    if len(future_path) < 2:
                        continue

                    # Body extends from the end of future_path inward
                    body_start = future_path[-1]
                    body_occ = body_occupied | set(future_path)
                    body_path = random_walk(body_start, body_len + 1,
                                            body_occ, grid_type, rows, cols)
                    if len(body_path) < 2:
                        continue

                    # rail = exit_cell → future → body (reversed so head is body[0])
                    # The snake slides from body toward exit
                    rail = list(reversed(body_path)) + future_path[1:]
                    actual_body = list(reversed(body_path))
                    body_length = len(actual_body)

                    if not actual_body:
                        continue

                    used_exits.add(exit_cell)
                    body_occupied.update(set(actual_body))

                    snakes_data.append({
                        'id': i,
                        'color': colors[i],
                        'rail': rail,
                        'body_length': body_length,
                    })
                    placed = True
                    break

                if not placed:
                    ok = False
                    break

        if not ok or len(snakes_data) < num_snakes:
            continue

        # Verify solvability
        solution = solve(snakes_data, grid_type, rows, cols)
        if solution is not None:
            return {
                'grid_type': grid_type,
                'rows': rows,
                'cols': cols,
                'difficulty': difficulty,
                'snakes': snakes_data,
                'solution': solution,
            }

    # Fallback: trivial level (no blocking)
    return generate_trivial(difficulty)


def generate_trivial(difficulty):
    """Fallback: snakes with no crossings, always solvable."""
    params = get_params(difficulty)
    rows, cols = params['rows'], params['cols']
    grid_type  = params['grid_types'][0]
    num_snakes = min(params['num_snakes'], 2)
    colors     = random.sample(COLORS, num_snakes)

    occupied = set()
    bound    = boundary_cells(grid_type, rows, cols)
    snakes   = []

    for i in range(num_snakes):
        for _ in range(100):
            exits = [b for b in bound if b not in occupied]
            if not exits:
                break
            exit_cell = random.choice(exits)
            rail = random_walk(exit_cell, 5, occupied, grid_type, rows, cols)
            if len(rail) < 3:
                continue
            body_length = len(rail) - 1
            occupied.update(set(rail))
            snakes.append({'id': i, 'color': colors[i],
                           'rail': rail, 'body_length': body_length})
            break

    return {
        'grid_type': grid_type, 'rows': rows, 'cols': cols,
        'difficulty': difficulty, 'snakes': snakes, 'solution': list(range(len(snakes))),
    }
