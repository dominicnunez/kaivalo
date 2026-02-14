<script>
  import '../app.css';

  let { children } = $props();
</script>

<div class="min-h-screen grain">
  <main>
    {@render children()}
  </main>
</div>
